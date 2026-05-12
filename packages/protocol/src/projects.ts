import { z } from 'zod';

export const ProjectSummarySchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type ProjectSummary = z.infer<typeof ProjectSummarySchema>;

export const ListProjectsResponseSchema = z.object({
  projects: z.array(ProjectSummarySchema),
});
export type ListProjectsResponse = z.infer<typeof ListProjectsResponseSchema>;

export const CreateProjectRequestSchema = z.object({
  name: z.string().min(1).max(120),
});
export type CreateProjectRequest = z.infer<typeof CreateProjectRequestSchema>;

export const RenameProjectRequestSchema = z.object({
  name: z.string().min(1).max(120),
});
export type RenameProjectRequest = z.infer<typeof RenameProjectRequestSchema>;

export const RenameThreadRequestSchema = z.object({
  title: z.string().min(1).max(240),
});
export type RenameThreadRequest = z.infer<typeof RenameThreadRequestSchema>;
