import multer from "multer";

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ok = [".xlsx", ".xls", ".csv"].some((ext) =>
      file.originalname.toLowerCase().endsWith(ext)
    );
    if (!ok) {
      return cb(new Error("Only .xlsx, .xls or .csv files are allowed"));
    }
    cb(null, true);
  },
});

export default upload;
