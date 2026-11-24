// Package media turns uploaded videos into HLS streams with ffmpeg.
//
// The worker is a loop inside the API process: it claims one module whose video is
// waiting ("uploaded"), transcodes it, and records "ready" or "failed" in the database.
// Claiming uses SELECT ... FOR UPDATE SKIP LOCKED, so several workers could run safely later.
package media

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"os"
	"os/exec"
	"path"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// Options configures the transcoder. Paths to ffmpeg and ffprobe can be absolute.
type Options struct {
	DB       *pgxpool.Pool
	MediaDir string
	FFmpeg   string        // e.g. "ffmpeg" or "C:\\tools\\ffmpeg\\bin\\ffmpeg.exe"
	FFprobe  string        // e.g. "ffprobe"
	Timeout  time.Duration // maximum time for one video
	Poll     time.Duration // how often to look for new work
}

// Transcoder processes uploaded videos one at a time.
type Transcoder struct {
	opt Options
}

func New(opt Options) *Transcoder {
	if opt.Timeout <= 0 {
		opt.Timeout = 4 * time.Hour
	}
	if opt.Poll <= 0 {
		opt.Poll = 5 * time.Second
	}
	return &Transcoder{opt: opt}
}

// Run blocks until ctx is cancelled, processing jobs as they arrive.
func (t *Transcoder) Run(ctx context.Context) error {
	// A job that was "processing" when the process stopped is put back in the queue.
	if _, err := t.opt.DB.Exec(ctx,
		`update modules set video_status = 'uploaded', updated_at = now() where video_status = 'processing'`); err != nil {
		return fmt.Errorf("reset interrupted jobs: %w", err)
	}

	ticker := time.NewTicker(t.opt.Poll)
	defer ticker.Stop()
	for {
		// Drain the queue before waiting again.
		for {
			did, err := t.processNext(ctx)
			if err != nil {
				log.Printf("transcoder: %v", err)
				break
			}
			if !did {
				break
			}
		}
		select {
		case <-ctx.Done():
			return nil
		case <-ticker.C:
		}
	}
}

// processNext claims and transcodes one job. It returns false when there is nothing to do.
func (t *Transcoder) processNext(ctx context.Context) (bool, error) {
	var moduleID int64
	var source string
	err := t.opt.DB.QueryRow(ctx, `
		update modules set video_status = 'processing', video_error = null, updated_at = now()
		where id = (
		  select id from modules
		  where video_status = 'uploaded'
		  order by updated_at
		  limit 1
		  for update skip locked)
		returning id, video_original_path`).Scan(&moduleID, &source)
	if err != nil {
		if isNoRows(err) {
			return false, nil
		}
		return false, err
	}

	log.Printf("transcoder: module %d started", moduleID)
	hlsRel, duration, err := t.transcode(ctx, moduleID, source)
	if err != nil {
		msg := err.Error()
		if len(msg) > 500 {
			msg = msg[len(msg)-500:]
		}
		log.Printf("transcoder: module %d failed: %s", moduleID, msg)
		// Only mark failed if the video is still the one we processed (it may have been replaced).
		_, dbErr := t.opt.DB.Exec(ctx, `
			update modules set video_status = 'failed', video_error = $3, updated_at = now()
			where id = $1 and video_original_path = $2`, moduleID, source, msg)
		return true, dbErr
	}

	// Record success only if the source is unchanged. If it was replaced mid-job, the new upload is queued.
	// The length measured by ffprobe replaces any typed value; the old value is kept only if probing failed.
	tag, err := t.opt.DB.Exec(ctx, `
		update modules set
		  video_status = 'ready', hls_path = $3, video_error = null,
		  duration_seconds = coalesce($4, duration_seconds), updated_at = now()
		where id = $1 and video_original_path = $2`, moduleID, source, hlsRel, duration)
	if err != nil {
		return true, err
	}
	if tag.RowsAffected() == 0 {
		log.Printf("transcoder: module %d was re-uploaded during processing; output discarded", moduleID)
		os.RemoveAll(filepath.Join(t.opt.MediaDir, filepath.FromSlash(hlsRel)))
		return true, nil
	}
	log.Printf("transcoder: module %d ready", moduleID)
	return true, nil
}

// transcode writes HLS output for one source file into hls/module-<id>/ and returns the master playlist path.
// It writes into a temporary folder first and renames it when finished, so a half-written stream is never served.
func (t *Transcoder) transcode(ctx context.Context, moduleID int64, source string) (string, *int, error) {
	ctx, cancel := context.WithTimeout(ctx, t.opt.Timeout)
	defer cancel()

	srcFull := filepath.Join(t.opt.MediaDir, filepath.FromSlash(source))
	info, err := t.probe(ctx, srcFull)
	if err != nil {
		return "", nil, err
	}
	if !info.hasVideo {
		return "", nil, errors.New("the file has no video stream")
	}
	if !info.hasAudio {
		return "", nil, errors.New("the file has no audio track; videos need sound")
	}

	hlsRoot := filepath.Join(t.opt.MediaDir, "hls")
	if err := os.MkdirAll(hlsRoot, 0o755); err != nil {
		return "", nil, err
	}
	finalDir := filepath.Join(hlsRoot, fmt.Sprintf("module-%d", moduleID))
	workDir, err := os.MkdirTemp(hlsRoot, fmt.Sprintf("module-%d-work-", moduleID))
	if err != nil {
		return "", nil, err
	}
	defer os.RemoveAll(workDir) // no-op after a successful rename

	if err := t.runFFmpeg(ctx, srcFull, workDir); err != nil {
		return "", nil, err
	}

	if err := os.RemoveAll(finalDir); err != nil {
		return "", nil, err
	}
	if err := os.Rename(workDir, finalDir); err != nil {
		return "", nil, err
	}

	var duration *int
	if info.durationSeconds > 0 {
		d := info.durationSeconds
		duration = &d
	}
	return path.Join("hls", fmt.Sprintf("module-%d", moduleID), "master.m3u8"), duration, nil
}

// runFFmpeg produces three renditions (720p, 480p, 360p) with audio, in HLS with a master playlist.
// Each rendition is a sub-folder (v0, v1, v2); the master playlist lets the player switch quality.
func (t *Transcoder) runFFmpeg(ctx context.Context, src, outDir string) error {
	filter := "[0:v:0]split=3[v0][v1][v2];" +
		"[v0]scale=-2:'min(720,ih)'[v720];" +
		"[v1]scale=-2:'min(480,ih)'[v480];" +
		"[v2]scale=-2:'min(360,ih)'[v360]"

	// ffmpeg writes the variant paths it is given into the playlists. Playlists must use forward
	// slashes, so pass outDir with "/" even on Windows (otherwise browsers cannot find the segments).
	outDir = filepath.ToSlash(outDir)

	args := []string{
		"-nostdin", "-hide_banner", "-loglevel", "error", "-y",
		"-i", src,
		"-filter_complex", filter,
		"-map", "[v720]", "-map", "[v480]", "-map", "[v360]",
		"-map", "0:a:0", "-map", "0:a:0", "-map", "0:a:0",
		"-c:v", "libx264", "-preset", "veryfast", "-crf", "23",
		"-profile:v", "main", "-pix_fmt", "yuv420p",
		"-g", "48", "-keyint_min", "48", "-sc_threshold", "0",
		"-b:v:0", "2800k", "-b:v:1", "1400k", "-b:v:2", "800k",
		"-c:a", "aac", "-b:a", "128k", "-ac", "2",
		"-f", "hls",
		"-hls_time", "6",
		"-hls_playlist_type", "vod",
		"-hls_segment_filename", path.Join(outDir, "%v", "seg_%05d.ts"),
		"-master_pl_name", "master.m3u8",
		"-var_stream_map", "v:0,a:0 v:1,a:1 v:2,a:2",
		path.Join(outDir, "%v", "index.m3u8"),
	}

	var stderr bytes.Buffer
	cmd := exec.CommandContext(ctx, t.opt.FFmpeg, args...)
	cmd.Stderr = &stderr
	if err := cmd.Run(); err != nil {
		if ctx.Err() != nil {
			return fmt.Errorf("transcoding timed out or was cancelled")
		}
		return fmt.Errorf("ffmpeg failed: %s", strings.TrimSpace(stderr.String()))
	}
	return nil
}

type probeInfo struct {
	hasVideo        bool
	hasAudio        bool
	durationSeconds int
}

// probe reads the stream layout and duration with ffprobe.
func (t *Transcoder) probe(ctx context.Context, src string) (probeInfo, error) {
	var out bytes.Buffer
	cmd := exec.CommandContext(ctx, t.opt.FFprobe,
		"-v", "error", "-print_format", "json", "-show_format", "-show_streams", src)
	cmd.Stdout = &out
	var stderr bytes.Buffer
	cmd.Stderr = &stderr
	if err := cmd.Run(); err != nil {
		return probeInfo{}, fmt.Errorf("could not read the video: %s", strings.TrimSpace(stderr.String()))
	}

	var parsed struct {
		Streams []struct {
			CodecType string `json:"codec_type"`
		} `json:"streams"`
		Format struct {
			Duration string `json:"duration"`
		} `json:"format"`
	}
	if err := json.Unmarshal(out.Bytes(), &parsed); err != nil {
		return probeInfo{}, fmt.Errorf("could not read video details: %w", err)
	}

	var info probeInfo
	for _, s := range parsed.Streams {
		switch s.CodecType {
		case "video":
			info.hasVideo = true
		case "audio":
			info.hasAudio = true
		}
	}
	if f, err := strconv.ParseFloat(parsed.Format.Duration, 64); err == nil {
		info.durationSeconds = int(f + 0.5)
	}
	return info, nil
}

func isNoRows(err error) bool {
	return errors.Is(err, pgx.ErrNoRows)
}
