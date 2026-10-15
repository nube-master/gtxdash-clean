import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useOperationId } from "@/contexts/OperationContext";

// ── Types ──
export type AcademyCourse = {
  id: string;
  title: string;
  description: string;
  cover_url: string;
  sort_order: number;
  is_published: boolean;
  created_at: string;
  updated_at: string;
};

// ── Queries ──

export function useAcademyCourses() {
  return useQuery({
    queryKey: ["academy-courses"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("academy_courses")
        .select("*")
        .order("sort_order");
      if (error) throw error;
      return data as AcademyCourse[];
    },
  });
}

export function useAcademyModules(courseId?: string) {
  return useQuery({
    queryKey: ["academy-modules", courseId],
    queryFn: async () => {
      let q = supabase.from("academy_modules").select("*").order("sort_order");
      if (courseId) q = q.eq("course_id", courseId);
      const { data, error } = await q;
      if (error) throw error;
      return data;
    },
    enabled: !!courseId,
  });
}

export function useAllAcademyModules() {
  return useQuery({
    queryKey: ["academy-modules-all"],
    queryFn: async () => {
      const { data, error } = await supabase.from("academy_modules").select("*").order("sort_order");
      if (error) throw error;
      return data;
    },
  });
}

export function useAcademyLessons(moduleId?: string) {
  return useQuery({
    queryKey: ["academy-lessons", moduleId],
    queryFn: async () => {
      let q = supabase.from("academy_lessons").select("*").order("sort_order");
      if (moduleId) q = q.eq("module_id", moduleId);
      const { data, error } = await q;
      if (error) throw error;
      return data;
    },
    enabled: !!moduleId,
  });
}

export function useCourseLessons(courseId?: string) {
  const { data: modules } = useAcademyModules(courseId);
  const moduleIds = modules?.map((m) => m.id) ?? [];
  return useQuery({
    queryKey: ["academy-lessons-course", courseId],
    queryFn: async () => {
      if (!moduleIds.length) return [];
      const { data, error } = await supabase
        .from("academy_lessons")
        .select("*")
        .in("module_id", moduleIds)
        .order("sort_order");
      if (error) throw error;
      return data;
    },
    enabled: moduleIds.length > 0,
  });
}

export function useAllAcademyLessons() {
  return useQuery({
    queryKey: ["academy-lessons-all"],
    queryFn: async () => {
      const { data, error } = await supabase.from("academy_lessons").select("*").order("sort_order");
      if (error) throw error;
      return data;
    },
  });
}

export function useAcademyPlaybooks() {
  return useQuery({
    queryKey: ["academy-playbooks"],
    queryFn: async () => {
      const { data, error } = await supabase.from("academy_playbooks").select("*").order("sort_order");
      if (error) throw error;
      return data;
    },
  });
}

export function useAcademyKnowledge() {
  return useQuery({
    queryKey: ["academy-knowledge"],
    queryFn: async () => {
      const { data, error } = await supabase.from("academy_knowledge").select("*").order("sort_order");
      if (error) throw error;
      return data;
    },
  });
}

// ── Progress ──

export function useUserProgress() {
  return useQuery({
    queryKey: ["academy-progress"],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return [];
      const { data, error } = await supabase
        .from("academy_lesson_progress")
        .select("*")
        .eq("user_id", user.id);
      if (error) throw error;
      return data;
    },
  });
}

export function useToggleLessonComplete() {
  const qc = useQueryClient();
  const opId = useOperationId();
  return useMutation({
    mutationFn: async (lessonId: string) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Não autenticado");

      const { data: existing } = await supabase
        .from("academy_lesson_progress")
        .select("*")
        .eq("user_id", user.id)
        .eq("lesson_id", lessonId)
        .maybeSingle();

      if (existing?.completed) {
        await supabase.from("academy_lesson_progress")
          .update({ completed: false, completed_at: null })
          .eq("id", existing.id);
      } else if (existing) {
        await supabase.from("academy_lesson_progress")
          .update({ completed: true, completed_at: new Date().toISOString() })
          .eq("id", existing.id);
      } else {
        await supabase.from("academy_lesson_progress")
          .insert({ user_id: user.id, lesson_id: lessonId, completed: true, completed_at: new Date().toISOString(), operation_id: opId! });
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["academy-progress"] });
      toast.success("Progresso atualizado");
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

// ── Comments ──

export function useLessonComments(lessonId?: string) {
  return useQuery({
    queryKey: ["academy-comments", lessonId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("academy_comments")
        .select("*")
        .eq("lesson_id", lessonId!)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data;
    },
    enabled: !!lessonId,
  });
}

export function useAddComment() {
  const qc = useQueryClient();
  const opId = useOperationId();
  return useMutation({
    mutationFn: async (input: { lesson_id: string; content: string }) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Não autenticado");
      const { data: profile } = await supabase
        .from("profiles")
        .select("display_name")
        .eq("user_id", user.id)
        .maybeSingle();
      const userName = profile?.display_name || user.email?.split("@")[0] || "Usuário";
      const { error } = await supabase.from("academy_comments").insert({
        lesson_id: input.lesson_id,
        user_id: user.id,
        user_name: userName,
        content: input.content,
        operation_id: opId!,
      });
      if (error) throw error;
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ["academy-comments", vars.lesson_id] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

// ── Mutations ──

export function useCreateCourse() {
  const qc = useQueryClient();
  const opId = useOperationId();
  return useMutation({
    mutationFn: async (input: { title: string; description: string; cover_url?: string }) => {
      const { data: existing } = await supabase.from("academy_courses").select("sort_order").order("sort_order", { ascending: false }).limit(1);
      const nextOrder = (existing?.[0]?.sort_order ?? -1) + 1;
      const { error } = await supabase.from("academy_courses").insert({ title: input.title, description: input.description, cover_url: input.cover_url || '', sort_order: nextOrder, is_published: true, operation_id: opId! });
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["academy-courses"] }); toast.success("Curso criado"); },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useUpdateCourse() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id: string; title?: string; description?: string; cover_url?: string }) => {
      const { id, ...rest } = input;
      const { error } = await supabase.from("academy_courses").update(rest).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["academy-courses"] }); toast.success("Jornada atualizada"); },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useDeleteCourse() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => { const { error } = await supabase.from("academy_courses").delete().eq("id", id); if (error) throw error; },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["academy-courses"] }); toast.success("Curso removido"); },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useCreateModule() {
  const qc = useQueryClient();
  const opId = useOperationId();
  return useMutation({
    mutationFn: async (input: { title: string; description: string; course_id: string }) => {
      const { data: existing } = await supabase.from("academy_modules").select("sort_order").eq("course_id", input.course_id).order("sort_order", { ascending: false }).limit(1);
      const nextOrder = (existing?.[0]?.sort_order ?? -1) + 1;
      const { error } = await supabase.from("academy_modules").insert({ title: input.title, description: input.description, course_id: input.course_id, sort_order: nextOrder, operation_id: opId! });
      if (error) throw error;
    },
    onSuccess: (_, vars) => { qc.invalidateQueries({ queryKey: ["academy-modules", vars.course_id] }); toast.success("Módulo criado"); },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useDeleteModule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => { const { error } = await supabase.from("academy_modules").delete().eq("id", id); if (error) throw error; },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["academy-modules"] }); toast.success("Módulo removido"); },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useCreateLesson() {
  const qc = useQueryClient();
  const opId = useOperationId();
  return useMutation({
    mutationFn: async (input: { module_id: string; title: string; description: string; video_url: string; content: string; checklist: string[]; links: { label: string; url: string }[] }) => {
      const { data: existing } = await supabase.from("academy_lessons").select("sort_order").eq("module_id", input.module_id).order("sort_order", { ascending: false }).limit(1);
      const nextOrder = (existing?.[0]?.sort_order ?? -1) + 1;
      const { error } = await supabase.from("academy_lessons").insert({ ...input, sort_order: nextOrder, operation_id: opId! });
      if (error) throw error;
    },
    onSuccess: (_, vars) => { qc.invalidateQueries({ queryKey: ["academy-lessons", vars.module_id] }); qc.invalidateQueries({ queryKey: ["academy-lessons-all"] }); qc.invalidateQueries({ queryKey: ["academy-lessons-course"] }); qc.invalidateQueries({ queryKey: ["academy-lessons-course-inline"] }); toast.success("Aula criada"); },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useUpdateLesson() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id: string; title?: string; description?: string; video_url?: string; content?: string; checklist?: string[]; links?: { label: string; url: string }[] }) => {
      const { id, ...rest } = input;
      const { error } = await supabase.from("academy_lessons").update(rest).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["academy-lessons"] });
      qc.invalidateQueries({ queryKey: ["academy-lessons-all"] });
      qc.invalidateQueries({ queryKey: ["academy-lessons-course"] });
      qc.invalidateQueries({ queryKey: ["academy-lessons-course-inline"] });
      toast.success("Aula atualizada");
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useDeleteLesson() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id: string; module_id: string }) => { const { error } = await supabase.from("academy_lessons").delete().eq("id", input.id); if (error) throw error; },
    onSuccess: (_, vars) => { qc.invalidateQueries({ queryKey: ["academy-lessons", vars.module_id] }); qc.invalidateQueries({ queryKey: ["academy-lessons-all"] }); qc.invalidateQueries({ queryKey: ["academy-lessons-course"] }); qc.invalidateQueries({ queryKey: ["academy-lessons-course-inline"] }); toast.success("Aula removida"); },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useCreatePlaybook() {
  const qc = useQueryClient();
  const opId = useOperationId();
  return useMutation({
    mutationFn: async (input: { title: string; category: string; content: string }) => {
      const { data: existing } = await supabase.from("academy_playbooks").select("sort_order").order("sort_order", { ascending: false }).limit(1);
      const nextOrder = (existing?.[0]?.sort_order ?? -1) + 1;
      const { error } = await supabase.from("academy_playbooks").insert({ ...input, sort_order: nextOrder, operation_id: opId! });
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["academy-playbooks"] }); toast.success("Playbook criado"); },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useUpdatePlaybook() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id: string; title: string; category: string; content: string }) => {
      const { id, ...rest } = input;
      const { error } = await supabase.from("academy_playbooks").update(rest).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["academy-playbooks"] }); toast.success("Playbook atualizado"); },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useDeletePlaybook() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => { const { error } = await supabase.from("academy_playbooks").delete().eq("id", id); if (error) throw error; },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["academy-playbooks"] }); toast.success("Playbook removido"); },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useCreateKnowledge() {
  const qc = useQueryClient();
  const opId = useOperationId();
  return useMutation({
    mutationFn: async (input: { title: string; category: string; content: string; tags: string[] }) => {
      const { data: existing } = await supabase.from("academy_knowledge").select("sort_order").order("sort_order", { ascending: false }).limit(1);
      const nextOrder = (existing?.[0]?.sort_order ?? -1) + 1;
      const { error } = await supabase.from("academy_knowledge").insert({ ...input, sort_order: nextOrder, operation_id: opId! });
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["academy-knowledge"] }); toast.success("Conceito criado"); },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useDeleteKnowledge() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => { const { error } = await supabase.from("academy_knowledge").delete().eq("id", id); if (error) throw error; },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["academy-knowledge"] }); toast.success("Conceito removido"); },
    onError: (e: Error) => toast.error(e.message),
  });
}
