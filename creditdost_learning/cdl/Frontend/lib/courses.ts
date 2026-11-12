// Types and API calls for the course studio. Mirrors the Go API responses.
import { apiGet, apiPost, apiSend, apiUpload } from "./api";

export type CourseStatus = "draft" | "active" | "archived";
export type Visibility = "public" | "private_link" | "invite_only";
export type VideoStatus = "none" | "uploaded" | "processing" | "ready" | "failed";

export type ListItem = {
  id: number;
  slug: string;
  title: string;
  status: CourseStatus;
  pricePaise: number;
  mrpPaise: number | null;
  category: string | null;
  instructors: string[];
  moduleCount: number;
  readyVideos: number;
  students: number;
  revenuePaise: number;
  hasThumbnail: boolean;
  updatedAt: string;
};

export type ListResult = {
  items: ListItem[];
  total: number;
  page: number;
  limit: number;
  counts: Record<string, number>;
  summary: { totalRevenuePaise: number; activeCourses: number };
};

export type Module = {
  id: number;
  courseId: number;
  moduleNumber: number;
  title: string;
  description: string;
  durationSeconds: number | null;
  isFreePreview: boolean;
  isNew: boolean;
  videoStatus: VideoStatus;
  videoError: string | null;
  videoSizeBytes: number | null;
  updatedAt: string;
};

export type Course = {
  id: number;
  slug: string;
  title: string;
  description: string;
  status: CourseStatus;
  pricePaise: number;
  mrpPaise: number | null;
  certificateEnabled: boolean;
  visibility: Visibility;
  primaryLanguage: string;
  category: { id: number; name: string; slug: string } | null;
  hasThumbnail: boolean;
  tags: string[];
  instructors: { id: number; name: string; title: string }[];
  modules: Module[];
  createdAt: string;
  updatedAt: string;
};

export type Category = { id: number; name: string; slug: string };
export type Instructor = { id: number; name: string; title: string };

/** Fields the editor can change. Omit a field to leave it alone. */
export type CoursePatch = Partial<{
  title: string;
  description: string;
  status: CourseStatus;
  pricePaise: number;
  mrpPaise: number; // 0 clears it
  certificateEnabled: boolean;
  visibility: Visibility;
  primaryLanguage: string;
  categoryId: number; // 0 clears it
  tags: string[];
  instructorIds: number[];
}>;

export type ListParams = {
  status: "all" | CourseStatus;
  q: string;
  category: number;
  sort: "recent" | "title" | "revenue";
  page: number;
  limit: number;
};

export function listCourses(p: ListParams): Promise<ListResult> {
  const qs = new URLSearchParams({
    status: p.status,
    sort: p.sort,
    page: String(p.page),
    limit: String(p.limit),
  });
  if (p.q.trim()) qs.set("q", p.q.trim());
  if (p.category > 0) qs.set("category", String(p.category));
  return apiGet<ListResult>(`/admin/courses?${qs.toString()}`);
}

export function createCourse(title: string): Promise<Course> {
  return apiPost<Course>("/admin/courses", { title });
}

export function getCourse(id: number): Promise<Course> {
  return apiGet<Course>(`/admin/courses/${id}`);
}

export function updateCourse(id: number, patch: CoursePatch): Promise<Course> {
  return apiSend<Course>("PATCH", `/admin/courses/${id}`, patch);
}

export function publishCourse(id: number): Promise<Course> {
  return apiPost<Course>(`/admin/courses/${id}/publish`, {});
}

export function createModule(
  courseId: number,
  body: { title: string; durationSeconds?: number; isFreePreview?: boolean; isNew?: boolean },
): Promise<Module> {
  return apiPost<Module>(`/admin/courses/${courseId}/modules`, body);
}

export type ModulePatch = Partial<{
  title: string;
  description: string;
  durationSeconds: number; // 0 clears it
  isFreePreview: boolean;
  isNew: boolean;
}>;

export function updateModule(id: number, patch: ModulePatch): Promise<Module> {
  return apiSend<Module>("PATCH", `/admin/modules/${id}`, patch);
}

export function deleteModule(id: number): Promise<{ status: string }> {
  return apiSend<{ status: string }>("DELETE", `/admin/modules/${id}`);
}

export function reorderModules(courseId: number, moduleIds: number[]): Promise<Module[]> {
  return apiSend<Module[]>("PUT", `/admin/courses/${courseId}/modules/order`, { moduleIds });
}

export function uploadModuleVideo(moduleId: number, file: File, onProgress?: (f: number) => void): Promise<Module> {
  return apiUpload<Module>(`/admin/modules/${moduleId}/video`, "video", file, onProgress);
}

export function uploadCourseThumbnail(courseId: number, file: File, onProgress?: (f: number) => void): Promise<Course> {
  return apiUpload<Course>(`/admin/courses/${courseId}/thumbnail`, "thumbnail", file, onProgress);
}

export function thumbnailUrl(courseId: number, version: number): string {
  return `/api/admin/courses/${courseId}/thumbnail?v=${version}`;
}

export function getCourseMeta(): Promise<{ categories: Category[]; instructors: Instructor[] }> {
  return apiGet(`/admin/course-meta`);
}

export function createInstructor(name: string, title: string): Promise<Instructor> {
  return apiPost<Instructor>("/admin/instructors", { name, title });
}

export function createCategory(name: string): Promise<Category> {
  return apiPost<Category>("/admin/categories", { name });
}
