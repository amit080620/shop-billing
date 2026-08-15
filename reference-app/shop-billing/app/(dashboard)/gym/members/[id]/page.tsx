import { notFound } from "next/navigation";
import { requireSession } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getTranslator } from "@/lib/i18n/server";
import { MemberDetailClient } from "./MemberDetailClient";

export default async function GymMemberDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await requireSession();
  const { lang } = await getTranslator();
  const admin = createSupabaseAdminClient();

  const { data: member } = await admin
    .from("customers")
    .select("id, name, phone, fitness_goal, height_cm, weight_kg, assigned_trainer_id")
    .eq("id", id)
    .eq("shop_id", session.shopId)
    .single();
  if (!member) notFound();

  const [{ data: workoutPlans }, { data: dietPlans }, { data: progressLogs }, { data: staff }] = await Promise.all([
    admin.from("workout_plans").select("id, title, notes, created_at, workout_exercises ( id, muscle_group, exercise_name, sets, reps, rest_seconds, sort_order )").eq("member_id", id).order("created_at", { ascending: false }),
    admin.from("diet_plans").select("id, goal, notes, created_at, diet_meals ( id, meal_slot, food_items, calories, sort_order )").eq("member_id", id).order("created_at", { ascending: false }),
    admin.from("progress_logs").select("id, weight_kg, body_fat_percent, note, created_at").eq("member_id", id).order("created_at", { ascending: true }),
    admin.from("staff").select("id, name").eq("shop_id", session.shopId).neq("role", "owner"),
  ]);

  return (
    <MemberDetailClient
      lang={lang}
      member={{
        id: member.id,
        name: member.name,
        phone: member.phone,
        fitnessGoal: member.fitness_goal,
        heightCm: member.height_cm ? Number(member.height_cm) : null,
        weightKg: member.weight_kg ? Number(member.weight_kg) : null,
        assignedTrainerId: member.assigned_trainer_id,
      }}
      trainers={staff ?? []}
      workoutPlans={(workoutPlans ?? []).map((p) => ({
        id: p.id,
        title: p.title,
        notes: p.notes,
        createdAt: p.created_at,
        exercises: (Array.isArray(p.workout_exercises) ? p.workout_exercises : [])
          .slice()
          .sort((a, b) => a.sort_order - b.sort_order)
          .map((e) => ({ id: e.id, muscleGroup: e.muscle_group, exerciseName: e.exercise_name, sets: e.sets, reps: e.reps, restSeconds: e.rest_seconds })),
      }))}
      dietPlans={(dietPlans ?? []).map((p) => ({
        id: p.id,
        goal: p.goal,
        notes: p.notes,
        createdAt: p.created_at,
        meals: (Array.isArray(p.diet_meals) ? p.diet_meals : [])
          .slice()
          .sort((a, b) => a.sort_order - b.sort_order)
          .map((m) => ({ id: m.id, mealSlot: m.meal_slot, foodItems: m.food_items, calories: m.calories ? Number(m.calories) : null })),
      }))}
      progressLogs={(progressLogs ?? []).map((l) => ({
        id: l.id,
        weightKg: l.weight_kg ? Number(l.weight_kg) : null,
        bodyFatPercent: l.body_fat_percent ? Number(l.body_fat_percent) : null,
        note: l.note,
        createdAt: l.created_at,
      }))}
    />
  );
}
