"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  createWorkoutPlanAction,
  deleteWorkoutPlanAction,
  createDietPlanAction,
  deleteDietPlanAction,
  addProgressLogAction,
  assignTrainerAction,
  type ExerciseInput,
  type MealInput,
} from "@/lib/actions/gym";
import { User } from "lucide-react";
import { PageHeader } from "@/app/components/PageHeader";
import { EmptyState } from "@/app/components/EmptyState";
import type { Lang } from "@/lib/i18n/dictionary";

type Member = { id: string; name: string; phone: string; fitnessGoal: string | null; heightCm: number | null; weightKg: number | null; assignedTrainerId: string | null };
type Exercise = { id: string; muscleGroup: string | null; exerciseName: string; sets: number | null; reps: string | null; restSeconds: number | null };
type WorkoutPlan = { id: string; title: string; notes: string | null; createdAt: string; exercises: Exercise[] };
type Meal = { id: string; mealSlot: string; foodItems: string; calories: number | null };
type DietPlan = { id: string; goal: string | null; notes: string | null; createdAt: string; meals: Meal[] };
type ProgressLog = { id: string; weightKg: number | null; bodyFatPercent: number | null; note: string | null; createdAt: string };

const MEAL_LABELS: Record<string, string> = {
  breakfast: "Breakfast",
  mid_morning: "Mid-morning",
  lunch: "Lunch",
  evening: "Evening",
  dinner: "Dinner",
  post_workout: "Post-workout",
};
const MUSCLE_GROUPS = ["Chest", "Back", "Legs", "Shoulders", "Arms", "Core", "Cardio", "Full Body"];

export function MemberDetailClient({
  member,
  trainers,
  workoutPlans,
  dietPlans,
  progressLogs,
}: {
  lang: Lang;
  member: Member;
  trainers: { id: string; name: string }[];
  workoutPlans: WorkoutPlan[];
  dietPlans: DietPlan[];
  progressLogs: ProgressLog[];
}) {
  const router = useRouter();
  const [tab, setTab] = useState<"overview" | "workout" | "diet" | "progress">("overview");
  const [isPending, startTransition] = useTransition();

  return (
    <div className="flex flex-col gap-4 pb-6">
      <PageHeader
        title={member.name}
        subtitle={member.phone}
        icon={<User size={18} strokeWidth={1.8} />}
      />
      <Link href="/gym/members" className="text-sm text-muted">
        ← Members
      </Link>

      <div className="flex gap-2 overflow-x-auto pb-1">
        {(["overview", "workout", "diet", "progress"] as const).map((tb) => (
          <button
            key={tb}
            onClick={() => setTab(tb)}
            className={`shrink-0 rounded-full border px-3.5 py-1.5 text-xs font-medium capitalize ${
              tab === tb ? "border-brand bg-brand-soft text-brand-dark" : "border-border text-muted"
            }`}
          >
            {tb === "workout" ? "🏋️ Workout" : tb === "diet" ? "🥗 Diet" : tb === "progress" ? "📈 Progress" : "Overview"}
          </button>
        ))}
      </div>

      {tab === "overview" && (
        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-lg border border-border bg-surface p-3 text-center">
              <p className="text-xs text-muted">Height</p>
              <p className="text-sm font-semibold text-foreground">{member.heightCm ? `${member.heightCm} cm` : "—"}</p>
            </div>
            <div className="rounded-lg border border-border bg-surface p-3 text-center">
              <p className="text-xs text-muted">Weight</p>
              <p className="text-sm font-semibold text-foreground">
                {progressLogs.length > 0 && progressLogs[progressLogs.length - 1].weightKg
                  ? `${progressLogs[progressLogs.length - 1].weightKg} kg`
                  : member.weightKg
                    ? `${member.weightKg} kg`
                    : "—"}
              </p>
            </div>
          </div>
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-medium text-foreground">Assigned trainer</span>
            <select
              defaultValue={member.assignedTrainerId ?? ""}
              onChange={(e) =>
                startTransition(async () => {
                  await assignTrainerAction(member.id, e.target.value || null);
                  router.refresh();
                })
              }
              disabled={isPending}
              className="rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-brand"
            >
              <option value="">No trainer assigned</option>
              {trainers.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </label>
        </div>
      )}

      {tab === "workout" && <WorkoutTab memberId={member.id} plans={workoutPlans} onChange={() => router.refresh()} />}
      {tab === "diet" && <DietTab memberId={member.id} plans={dietPlans} onChange={() => router.refresh()} />}
      {tab === "progress" && <ProgressTab memberId={member.id} logs={progressLogs} onChange={() => router.refresh()} />}
    </div>
  );
}

function WorkoutTab({ memberId, plans, onChange }: { memberId: string; plans: WorkoutPlan[]; onChange: () => void }) {
  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState("");
  const [notes, setNotes] = useState("");
  const [exercises, setExercises] = useState<ExerciseInput[]>([{ muscleGroup: "", exerciseName: "", sets: 3, reps: "12", restSeconds: 60 }]);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function save() {
    startTransition(async () => {
      const result = await createWorkoutPlanAction({ memberId, title, notes, exercises });
      if (result.error) {
        setError(result.error);
        return;
      }
      setShowForm(false);
      setTitle("");
      setNotes("");
      setExercises([{ muscleGroup: "", exerciseName: "", sets: 3, reps: "12", restSeconds: 60 }]);
      onChange();
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <button onClick={() => setShowForm((v) => !v)} className="btn-primary-sm self-start">
        + New workout plan
      </button>

      {showForm && (
        <div className="flex flex-col gap-3 rounded-xl border border-dashed border-brand bg-brand-soft p-4">
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Plan title (e.g. Week 1 — Push Day)" className="rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-brand" />
          {exercises.map((ex, i) => (
            <div key={i} className="flex flex-col gap-1.5 rounded-lg border border-border bg-surface p-2.5">
              <div className="flex gap-1.5">
                <select
                  value={ex.muscleGroup}
                  onChange={(e) => setExercises((prev) => prev.map((p, j) => (j === i ? { ...p, muscleGroup: e.target.value } : p)))}
                  className="rounded-lg border border-border px-2 py-1.5 text-xs outline-none focus:border-brand"
                >
                  <option value="">Group</option>
                  {MUSCLE_GROUPS.map((g) => (
                    <option key={g} value={g}>
                      {g}
                    </option>
                  ))}
                </select>
                <input
                  value={ex.exerciseName}
                  onChange={(e) => setExercises((prev) => prev.map((p, j) => (j === i ? { ...p, exerciseName: e.target.value } : p)))}
                  placeholder="Exercise name"
                  className="flex-1 rounded-lg border border-border px-2 py-1.5 text-xs outline-none focus:border-brand"
                />
              </div>
              <div className="flex gap-1.5">
                <input
                  type="number"
                  value={ex.sets ?? ""}
                  onChange={(e) => setExercises((prev) => prev.map((p, j) => (j === i ? { ...p, sets: e.target.value ? Number(e.target.value) : null } : p)))}
                  placeholder="Sets"
                  className="w-16 rounded-lg border border-border px-2 py-1.5 text-xs outline-none focus:border-brand"
                />
                <input
                  value={ex.reps}
                  onChange={(e) => setExercises((prev) => prev.map((p, j) => (j === i ? { ...p, reps: e.target.value } : p)))}
                  placeholder="Reps (e.g. 12 or 8-10)"
                  className="w-24 rounded-lg border border-border px-2 py-1.5 text-xs outline-none focus:border-brand"
                />
                <input
                  type="number"
                  value={ex.restSeconds ?? ""}
                  onChange={(e) => setExercises((prev) => prev.map((p, j) => (j === i ? { ...p, restSeconds: e.target.value ? Number(e.target.value) : null } : p)))}
                  placeholder="Rest (sec)"
                  className="w-20 rounded-lg border border-border px-2 py-1.5 text-xs outline-none focus:border-brand"
                />
                {exercises.length > 1 && (
                  <button onClick={() => setExercises((prev) => prev.filter((_, j) => j !== i))} className="ml-auto text-xs text-danger">
                    ✕
                  </button>
                )}
              </div>
            </div>
          ))}
          <button
            onClick={() => setExercises((prev) => [...prev, { muscleGroup: "", exerciseName: "", sets: 3, reps: "12", restSeconds: 60 }])}
            className="self-start text-xs font-medium text-brand"
          >
            + Add exercise
          </button>
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Notes (optional)" rows={2} className="rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-brand" />
          {error && <p className="text-xs text-danger">{error}</p>}
          <div className="flex gap-2">
            <button onClick={save} disabled={isPending} className="btn-primary-sm disabled:opacity-60">
              {isPending ? "Saving…" : "Save plan"}
            </button>
            <button onClick={() => setShowForm(false)} className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-muted">
              Cancel
            </button>
          </div>
        </div>
      )}

      {plans.length === 0 ? (
        <EmptyState text="No workout plans yet." />
      ) : (
        <ul className="flex flex-col gap-2">
          {plans.map((p) => (
            <li key={p.id} className="rounded-xl border border-border bg-surface p-3.5 shadow-sm">
              <div className="flex items-start justify-between">
                <p className="text-sm font-semibold text-foreground">{p.title}</p>
                <button
                  onClick={() =>
                    startTransition(async () => {
                      await deleteWorkoutPlanAction(p.id);
                      onChange();
                    })
                  }
                  className="text-xs text-danger"
                >
                  Delete
                </button>
              </div>
              <ul className="mt-1.5 flex flex-col gap-1">
                {p.exercises.map((ex) => (
                  <li key={ex.id} className="text-xs text-muted">
                    {ex.muscleGroup ? `[${ex.muscleGroup}] ` : ""}
                    {ex.exerciseName} — {ex.sets ?? "?"} × {ex.reps ?? "?"}
                    {ex.restSeconds ? `, rest ${ex.restSeconds}s` : ""}
                  </li>
                ))}
              </ul>
              {p.notes && <p className="mt-1 text-xs text-muted">{p.notes}</p>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function DietTab({ memberId, plans, onChange }: { memberId: string; plans: DietPlan[]; onChange: () => void }) {
  const [showForm, setShowForm] = useState(false);
  const [goal, setGoal] = useState("");
  const [notes, setNotes] = useState("");
  const [meals, setMeals] = useState<MealInput[]>([{ mealSlot: "breakfast", foodItems: "", calories: null }]);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function save() {
    startTransition(async () => {
      const result = await createDietPlanAction({ memberId, goal, notes, meals });
      if (result.error) {
        setError(result.error);
        return;
      }
      setShowForm(false);
      setGoal("");
      setNotes("");
      setMeals([{ mealSlot: "breakfast", foodItems: "", calories: null }]);
      onChange();
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <button onClick={() => setShowForm((v) => !v)} className="btn-primary-sm self-start">
        + New diet plan
      </button>

      {showForm && (
        <div className="flex flex-col gap-3 rounded-xl border border-dashed border-brand bg-brand-soft p-4">
          <select value={goal} onChange={(e) => setGoal(e.target.value)} className="rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-brand">
            <option value="">Goal (optional)</option>
            <option value="Weight Loss">Weight Loss</option>
            <option value="Weight Gain">Weight Gain</option>
            <option value="Muscle Gain">Muscle Gain</option>
            <option value="Maintenance">Maintenance</option>
            <option value="General Fitness">General Fitness</option>
          </select>
          {meals.map((meal, i) => (
            <div key={i} className="flex flex-col gap-1.5 rounded-lg border border-border bg-surface p-2.5">
              <div className="flex gap-1.5">
                <select
                  value={meal.mealSlot}
                  onChange={(e) => setMeals((prev) => prev.map((m, j) => (j === i ? { ...m, mealSlot: e.target.value as MealInput["mealSlot"] } : m)))}
                  className="rounded-lg border border-border px-2 py-1.5 text-xs outline-none focus:border-brand"
                >
                  {Object.entries(MEAL_LABELS).map(([v, l]) => (
                    <option key={v} value={v}>
                      {l}
                    </option>
                  ))}
                </select>
                <input
                  type="number"
                  value={meal.calories ?? ""}
                  onChange={(e) => setMeals((prev) => prev.map((m, j) => (j === i ? { ...m, calories: e.target.value ? Number(e.target.value) : null } : m)))}
                  placeholder="Kcal"
                  className="w-20 rounded-lg border border-border px-2 py-1.5 text-xs outline-none focus:border-brand"
                />
                {meals.length > 1 && (
                  <button onClick={() => setMeals((prev) => prev.filter((_, j) => j !== i))} className="ml-auto text-xs text-danger">
                    ✕
                  </button>
                )}
              </div>
              <input
                value={meal.foodItems}
                onChange={(e) => setMeals((prev) => prev.map((m, j) => (j === i ? { ...m, foodItems: e.target.value } : m)))}
                placeholder="Food items (e.g. 3 eggs, 2 toast, banana)"
                className="rounded-lg border border-border px-2 py-1.5 text-xs outline-none focus:border-brand"
              />
            </div>
          ))}
          <button
            onClick={() => setMeals((prev) => [...prev, { mealSlot: "lunch", foodItems: "", calories: null }])}
            className="self-start text-xs font-medium text-brand"
          >
            + Add meal
          </button>
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Notes (optional)" rows={2} className="rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-brand" />
          {error && <p className="text-xs text-danger">{error}</p>}
          <div className="flex gap-2">
            <button onClick={save} disabled={isPending} className="btn-primary-sm disabled:opacity-60">
              {isPending ? "Saving…" : "Save plan"}
            </button>
            <button onClick={() => setShowForm(false)} className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-muted">
              Cancel
            </button>
          </div>
        </div>
      )}

      {plans.length === 0 ? (
        <EmptyState text="No diet plans yet." />
      ) : (
        <ul className="flex flex-col gap-2">
          {plans.map((p) => (
            <li key={p.id} className="rounded-xl border border-border bg-surface p-3.5 shadow-sm">
              <div className="flex items-start justify-between">
                <p className="text-sm font-semibold text-foreground">{p.goal || "Diet plan"}</p>
                <button
                  onClick={() =>
                    startTransition(async () => {
                      await deleteDietPlanAction(p.id);
                      onChange();
                    })
                  }
                  className="text-xs text-danger"
                >
                  Delete
                </button>
              </div>
              <ul className="mt-1.5 flex flex-col gap-1">
                {p.meals.map((m) => (
                  <li key={m.id} className="text-xs text-muted">
                    <strong>{MEAL_LABELS[m.mealSlot] ?? m.mealSlot}:</strong> {m.foodItems}
                    {m.calories ? ` (${m.calories} kcal)` : ""}
                  </li>
                ))}
              </ul>
              {p.notes && <p className="mt-1 text-xs text-muted">{p.notes}</p>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ProgressTab({ memberId, logs, onChange }: { memberId: string; logs: ProgressLog[]; onChange: () => void }) {
  const [weight, setWeight] = useState("");
  const [bodyFat, setBodyFat] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const maxWeight = Math.max(...logs.map((l) => l.weightKg ?? 0), 1);
  const minWeight = Math.min(...logs.filter((l) => l.weightKg).map((l) => l.weightKg ?? 0), maxWeight);

  function save() {
    startTransition(async () => {
      const result = await addProgressLogAction({
        memberId,
        weightKg: weight ? Number(weight) : null,
        bodyFatPercent: bodyFat ? Number(bodyFat) : null,
        note,
      });
      if (result.error) {
        setError(result.error);
        return;
      }
      setWeight("");
      setBodyFat("");
      setNote("");
      onChange();
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-2 rounded-xl border border-dashed border-brand bg-brand-soft p-4">
        <p className="text-sm font-medium text-brand-dark">Log today&apos;s progress</p>
        <div className="flex gap-2">
          <input type="number" step="0.1" value={weight} onChange={(e) => setWeight(e.target.value)} placeholder="Weight (kg)" className="flex-1 rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-brand" />
          <input type="number" step="0.1" value={bodyFat} onChange={(e) => setBodyFat(e.target.value)} placeholder="Body fat %" className="flex-1 rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-brand" />
        </div>
        <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note (optional)" className="rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-brand" />
        {error && <p className="text-xs text-danger">{error}</p>}
        <button onClick={save} disabled={isPending} className="btn-primary-sm self-start disabled:opacity-60">
          {isPending ? "Saving…" : "+ Add entry"}
        </button>
      </div>

      {logs.length === 0 ? (
        <EmptyState text="No progress logged yet." />
      ) : (
        <>
          {logs.some((l) => l.weightKg) && (
            <div className="flex h-32 items-end gap-1.5 rounded-xl border border-border bg-surface p-3">
              {logs
                .filter((l) => l.weightKg)
                .map((l) => {
                  const range = maxWeight - minWeight || 1;
                  const heightPct = 15 + ((l.weightKg! - minWeight) / range) * 85;
                  return (
                    <div key={l.id} className="flex flex-1 flex-col items-center justify-end gap-1">
                      <div className="w-full rounded-t bg-brand" style={{ height: `${heightPct}%` }} />
                      <span className="text-[9px] text-muted">{l.weightKg}</span>
                    </div>
                  );
                })}
            </div>
          )}
          <ul className="flex flex-col gap-2">
            {logs
              .slice()
              .reverse()
              .map((l) => (
                <li key={l.id} className="rounded-lg border border-border bg-surface px-3.5 py-2.5 text-sm">
                  <p className="text-foreground">
                    {l.weightKg ? `${l.weightKg} kg` : ""}
                    {l.bodyFatPercent ? ` · ${l.bodyFatPercent}% body fat` : ""}
                  </p>
                  {l.note && <p className="text-xs text-muted">{l.note}</p>}
                  <p className="text-[11px] text-muted">{new Date(l.createdAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}</p>
                </li>
              ))}
          </ul>
        </>
      )}
    </div>
  );
}
