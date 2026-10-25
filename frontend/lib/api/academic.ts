import { apiRequest } from "@/lib/api/client";
import type {
  CourseCreateRequest,
  CoursePatchRequest,
  CoursePublic,
  LessonCreateRequest,
  LessonDetail,
  LessonPatchRequest,
  LessonSummary,
  ModuleCreateRequest,
  ModulePatchRequest,
  ModulePublic,
  PageCourses,
} from "@/lib/types/academic";

/**
 * Milestone 02A academic catalog client.
 *
 * These calls intentionally bypass the Cloud Preview Demo adapter: academic
 * curriculum is authoritative data, so it is never satisfied from an in-memory
 * fixture. When no backend is reachable the request fails with
 * `BACKEND_UNREACHABLE` and the UI renders an honest unavailable state rather
 * than fabricated catalogue content.
 */

function courseQuery(
  limit?: number,
  offset?: number
): Record<string, string | undefined> {
  return {
    limit: limit === undefined ? undefined : String(limit),
    offset: offset === undefined ? undefined : String(offset),
  };
}

export const academicApi = {
  // -- published catalog reads (any authenticated role) --------------------

  async listCourses(limit?: number, offset?: number): Promise<PageCourses> {
    return apiRequest<PageCourses>("/courses", {
      method: "GET",
      query: courseQuery(limit, offset),
    });
  },

  async getCourse(courseId: string): Promise<CoursePublic> {
    return apiRequest<CoursePublic>(
      `/courses/${encodeURIComponent(courseId)}`,
      { method: "GET" }
    );
  },

  async listCourseModules(courseId: string): Promise<ModulePublic[]> {
    return apiRequest<ModulePublic[]>(
      `/courses/${encodeURIComponent(courseId)}/modules`,
      { method: "GET" }
    );
  },

  async getModule(moduleId: string): Promise<ModulePublic> {
    return apiRequest<ModulePublic>(
      `/modules/${encodeURIComponent(moduleId)}`,
      { method: "GET" }
    );
  },

  async listModuleLessons(moduleId: string): Promise<LessonSummary[]> {
    return apiRequest<LessonSummary[]>(
      `/modules/${encodeURIComponent(moduleId)}/lessons`,
      { method: "GET" }
    );
  },

  /** Content managers only in 02A; students and instructors receive `403`. */
  async getLesson(lessonId: string): Promise<LessonDetail> {
    return apiRequest<LessonDetail>(
      `/lessons/${encodeURIComponent(lessonId)}`,
      { method: "GET" }
    );
  },

  // -- content management (Manager / Administrator) ------------------------

  /** Includes drafts and archived courses. Reads do not require fresh step-up. */
  async listAdminCourses(limit?: number, offset?: number): Promise<PageCourses> {
    return apiRequest<PageCourses>("/admin/courses", {
      method: "GET",
      query: courseQuery(limit, offset),
    });
  },

  /** Re-opens any course whatever its status — used to reload a draft. */
  async getAdminCourse(courseId: string): Promise<CoursePublic> {
    return apiRequest<CoursePublic>(
      `/admin/courses/${encodeURIComponent(courseId)}`,
      { method: "GET" }
    );
  },

  /** All modules including drafts and archived, ordered by `sequence`. */
  async listAdminModules(courseId: string): Promise<ModulePublic[]> {
    return apiRequest<ModulePublic[]>(
      `/admin/courses/${encodeURIComponent(courseId)}/modules`,
      { method: "GET" }
    );
  },

  async createCourse(payload: CourseCreateRequest): Promise<CoursePublic> {
    return apiRequest<CoursePublic>("/admin/courses", {
      method: "POST",
      body: payload,
    });
  },

  async updateCourse(
    courseId: string,
    payload: CoursePatchRequest
  ): Promise<CoursePublic> {
    return apiRequest<CoursePublic>(
      `/admin/courses/${encodeURIComponent(courseId)}`,
      { method: "PATCH", body: payload }
    );
  },

  async publishCourse(courseId: string): Promise<CoursePublic> {
    return apiRequest<CoursePublic>(
      `/admin/courses/${encodeURIComponent(courseId)}/publish`,
      { method: "POST" }
    );
  },

  async createModule(
    courseId: string,
    payload: ModuleCreateRequest
  ): Promise<ModulePublic> {
    return apiRequest<ModulePublic>(
      `/admin/courses/${encodeURIComponent(courseId)}/modules`,
      { method: "POST", body: payload }
    );
  },

  async updateModule(
    moduleId: string,
    payload: ModulePatchRequest
  ): Promise<ModulePublic> {
    return apiRequest<ModulePublic>(
      `/admin/modules/${encodeURIComponent(moduleId)}`,
      { method: "PATCH", body: payload }
    );
  },

  async publishModule(moduleId: string): Promise<ModulePublic> {
    return apiRequest<ModulePublic>(
      `/admin/modules/${encodeURIComponent(moduleId)}/publish`,
      { method: "POST" }
    );
  },

  async createLesson(
    moduleId: string,
    payload: LessonCreateRequest
  ): Promise<LessonDetail> {
    return apiRequest<LessonDetail>(
      `/admin/modules/${encodeURIComponent(moduleId)}/lessons`,
      { method: "POST", body: payload }
    );
  },

  async updateLesson(
    lessonId: string,
    payload: LessonPatchRequest
  ): Promise<LessonDetail> {
    return apiRequest<LessonDetail>(
      `/admin/lessons/${encodeURIComponent(lessonId)}`,
      { method: "PATCH", body: payload }
    );
  },

  async publishLesson(lessonId: string): Promise<LessonDetail> {
    return apiRequest<LessonDetail>(
      `/admin/lessons/${encodeURIComponent(lessonId)}/publish`,
      { method: "POST" }
    );
  },
};
