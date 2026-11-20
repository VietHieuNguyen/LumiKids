import { LessonPlanEditorPage } from "@/features/lesson-plans/lesson-plan-editor";

export default async function Page({ params }: { params: Promise<{ lessonPlanId: string }> }) {
  const { lessonPlanId } = await params;
  return <LessonPlanEditorPage lessonPlanId={lessonPlanId} />;
}
