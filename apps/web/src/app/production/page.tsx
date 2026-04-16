"use client";

import { useState, useMemo } from "react";
import { api } from "@/trpc/react";

type Shift = "morning" | "afternoon" | "evening";
type Status = "planned" | "in_progress" | "done" | "cancelled";

const SHIFTS: Shift[] = ["morning", "afternoon", "evening"];

const SHIFT_LABEL: Record<Shift, string> = {
  morning:   "Morning",
  afternoon: "Afternoon",
  evening:   "Evening",
};

const SHIFT_ICON: Record<Shift, string> = {
  morning:   "🌅",
  afternoon: "☀️",
  evening:   "🌙",
};

const STATUS_STYLE: Record<Status, string> = {
  planned:     "bg-blue-100 text-blue-700 border-blue-200",
  in_progress: "bg-amber-100 text-amber-700 border-amber-200",
  done:        "bg-emerald-100 text-emerald-700 border-emerald-200",
  cancelled:   "bg-gray-100 text-gray-500 border-gray-200",
};

const STATUS_LABELS: Status[] = ["planned", "in_progress", "done", "cancelled"];

function isoWeek(d: Date) {
  const jan1 = new Date(d.getFullYear(), 0, 1);
  const diff  = d.getTime() - jan1.getTime();
  return Math.ceil((diff / 86400000 + jan1.getDay() + 1) / 7);
}

function weekDates(mondayDate: Date): Date[] {
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(mondayDate);
    d.setDate(mondayDate.getDate() + i);
    return d;
  });
}

function toIso(d: Date) { return d.toISOString().slice(0, 10); }

function getMondayOf(d: Date): Date {
  const copy = new Date(d);
  const day  = copy.getDay(); // 0 = Sun
  const diff = day === 0 ? -6 : 1 - day;
  copy.setDate(copy.getDate() + diff);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

const DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const MONTHS    = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

export default function ProductionPage() {
  const [monday, setMonday]   = useState(() => getMondayOf(new Date()));
  const [addDay,  setAddDay]  = useState<string | null>(null);
  const [addShift, setAddShift] = useState<Shift>("morning");

  // Form state
  const [recipeId,   setRecipeId]   = useState("");
  const [recipeName, setRecipeName] = useState("");
  const [batchCount, setBatchCount] = useState("1");
  const [notes,      setNotes]      = useState("");
  const [assignedTo, setAssignedTo] = useState("");

  const days = weekDates(monday);
  const from = toIso(days[0]!);
  const to   = toIso(days[6]!);

  const { data: schedule = [], refetch } = api.production.getSchedule.useQuery({ from, to });
  const { data: recipes  = [] }          = api.recipes.getAll.useQuery({ limit: 100 });

  const create = api.production.create.useMutation({ onSuccess: () => { refetch(); closeForm(); } });
  const update = api.production.update.useMutation({ onSuccess: () => refetch() });
  const remove = api.production.delete.useMutation({ onSuccess: () => refetch() });

  // Group schedule entries by date+shift
  const grouped = useMemo(() => {
    const map = new Map<string, typeof schedule>();
    for (const entry of schedule) {
      const key = `${entry.scheduledDate}::${entry.shift}`;
      const arr = map.get(key) ?? [];
      arr.push(entry);
      map.set(key, arr);
    }
    return map;
  }, [schedule]);

  function prevWeek() {
    setMonday((m) => { const d = new Date(m); d.setDate(d.getDate() - 7); return d; });
  }
  function nextWeek() {
    setMonday((m) => { const d = new Date(m); d.setDate(d.getDate() + 7); return d; });
  }
  function goToday() { setMonday(getMondayOf(new Date())); }

  function openForm(day: string, shift: Shift) {
    setAddDay(day);
    setAddShift(shift);
    setRecipeId("");
    setRecipeName("");
    setBatchCount("1");
    setNotes("");
    setAssignedTo("");
  }
  function closeForm() {
    setAddDay(null);
  }

  function handleSubmit() {
    if (!addDay) return;
    const selectedRecipe = recipes.find((r) => r.id === recipeId);
    create.mutate({
      recipeId:      recipeId || null,
      recipeName:    selectedRecipe?.name ?? (recipeName.trim() || null),
      scheduledDate: addDay,
      shift:         addShift,
      batchCount:    parseFloat(batchCount) || 1,
      notes:         notes.trim() || null,
      assignedTo:    assignedTo.trim() || null,
    });
  }

  const todayIso = toIso(new Date());

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="page-title">Production Schedule</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Week {isoWeek(monday)} · {MONTHS[monday.getMonth()]} {monday.getFullYear()}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={prevWeek} className="px-3 py-1.5 rounded-lg border border-rose-200 text-sm text-brand-600 hover:bg-rose-50 transition-colors">
            ← Prev
          </button>
          <button onClick={goToday} className="px-3 py-1.5 rounded-lg border border-rose-200 text-sm text-brand-600 hover:bg-rose-50 transition-colors">
            Today
          </button>
          <button onClick={nextWeek} className="px-3 py-1.5 rounded-lg border border-rose-200 text-sm text-brand-600 hover:bg-rose-50 transition-colors">
            Next →
          </button>
        </div>
      </div>

      {/* Calendar grid */}
      <div className="overflow-x-auto">
        <div className="min-w-[700px]">
          {/* Day header */}
          <div className="grid grid-cols-8 gap-1 mb-1">
            <div className="w-24" /> {/* Shift label column */}
            {days.map((d, i) => {
              const iso      = toIso(d);
              const isToday  = iso === todayIso;
              return (
                <div key={iso} className={`text-center py-2 rounded-lg text-sm font-medium ${
                  isToday ? "bg-brand-600 text-white" : "text-gray-500"
                }`}>
                  <p className="text-xs opacity-75">{DAY_NAMES[i]}</p>
                  <p className="text-base font-semibold leading-tight">{d.getDate()}</p>
                </div>
              );
            })}
          </div>

          {/* Shift rows */}
          {SHIFTS.map((shift) => (
            <div key={shift} className="grid grid-cols-8 gap-1 mb-1">
              {/* Shift label */}
              <div className="flex flex-col items-center justify-center py-2 text-center">
                <span className="text-base">{SHIFT_ICON[shift]}</span>
                <span className="text-[10px] text-gray-400 mt-0.5">{SHIFT_LABEL[shift]}</span>
              </div>

              {/* Day cells */}
              {days.map((d) => {
                const iso     = toIso(d);
                const key     = `${iso}::${shift}`;
                const entries = grouped.get(key) ?? [];

                return (
                  <div key={iso} className="min-h-[80px] bg-white border border-rose-100 rounded-xl p-1.5 flex flex-col gap-1">
                    {entries.map((entry) => (
                      <div
                        key={entry.id}
                        className={`rounded-lg border text-[10px] px-1.5 py-1 leading-tight ${STATUS_STYLE[entry.status as Status]}`}
                      >
                        <p className="font-semibold truncate">{entry.recipeName ?? entry.recipe?.name ?? "—"}</p>
                        <p className="opacity-75">{entry.batchCount}× batch</p>
                        {entry.assignedTo && <p className="opacity-60 truncate">{entry.assignedTo}</p>}
                        <div className="flex gap-1 mt-1 flex-wrap">
                          {STATUS_LABELS.filter((s) => s !== entry.status).slice(0, 2).map((s) => (
                            <button
                              key={s}
                              onClick={() => update.mutate({ id: entry.id, status: s })}
                              className="underline opacity-60 hover:opacity-100 text-[9px]"
                            >
                              {s === "done" ? "✓ done" : s === "in_progress" ? "▶ start" : s === "cancelled" ? "✕" : s}
                            </button>
                          ))}
                          <button
                            onClick={() => { if (confirm("Remove this entry?")) remove.mutate(entry.id); }}
                            className="opacity-40 hover:opacity-100 text-[9px] ml-auto"
                          >✕</button>
                        </div>
                      </div>
                    ))}

                    {/* Add button */}
                    <button
                      onClick={() => openForm(iso, shift)}
                      className="mt-auto text-[10px] text-brand-400 hover:text-brand-600 hover:bg-rose-50 rounded py-0.5 transition-colors"
                    >
                      + add
                    </button>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>

      {/* Quick-add form overlay */}
      {addDay && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm px-4"
          onClick={closeForm}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl border border-rose-100 p-6 w-full max-w-md space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-gray-800">
                Add to {SHIFT_ICON[addShift]} {SHIFT_LABEL[addShift]} · {addDay}
              </h3>
              <button onClick={closeForm} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
            </div>

            {/* Shift selector */}
            <div className="flex gap-2">
              {SHIFTS.map((s) => (
                <button
                  key={s}
                  onClick={() => setAddShift(s)}
                  className={`flex-1 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                    s === addShift ? "bg-brand-600 text-white border-brand-600" : "border-rose-200 text-brand-600 hover:bg-rose-50"
                  }`}
                >
                  {SHIFT_ICON[s]} {SHIFT_LABEL[s]}
                </button>
              ))}
            </div>

            {/* Recipe picker */}
            <div>
              <label className="text-xs font-medium text-gray-500 block mb-1">Recipe</label>
              <select
                value={recipeId}
                onChange={(e) => setRecipeId(e.target.value)}
                className="w-full border border-rose-200 rounded-lg px-3 py-2 text-sm text-gray-800 focus:outline-none focus:border-brand-400"
              >
                <option value="">— Select recipe —</option>
                {recipes.map((r) => (
                  <option key={r.id} value={r.id}>{r.name}</option>
                ))}
              </select>
              {!recipeId && (
                <input
                  value={recipeName}
                  onChange={(e) => setRecipeName(e.target.value)}
                  placeholder="Or type a free-form task…"
                  className="mt-2 w-full border border-rose-200 rounded-lg px-3 py-2 text-sm text-gray-800 focus:outline-none focus:border-brand-400"
                />
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-gray-500 block mb-1">Batches</label>
                <input
                  type="number"
                  min="0.25"
                  step="0.25"
                  value={batchCount}
                  onChange={(e) => setBatchCount(e.target.value)}
                  className="w-full border border-rose-200 rounded-lg px-3 py-2 text-sm text-gray-800 focus:outline-none focus:border-brand-400"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-500 block mb-1">Assigned to</label>
                <input
                  value={assignedTo}
                  onChange={(e) => setAssignedTo(e.target.value)}
                  placeholder="Name…"
                  className="w-full border border-rose-200 rounded-lg px-3 py-2 text-sm text-gray-800 focus:outline-none focus:border-brand-400"
                />
              </div>
            </div>

            <div>
              <label className="text-xs font-medium text-gray-500 block mb-1">Notes</label>
              <input
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Optional notes…"
                className="w-full border border-rose-200 rounded-lg px-3 py-2 text-sm text-gray-800 focus:outline-none focus:border-brand-400"
              />
            </div>

            <div className="flex gap-3 pt-1">
              <button onClick={closeForm} className="flex-1 py-2 rounded-lg border border-rose-200 text-sm text-gray-600 hover:bg-rose-50 transition-colors">
                Cancel
              </button>
              <button
                onClick={handleSubmit}
                disabled={create.isPending || (!recipeId && !recipeName.trim())}
                className="flex-1 py-2 rounded-lg bg-brand-600 text-white text-sm font-semibold hover:bg-brand-700 transition-colors disabled:opacity-40"
              >
                {create.isPending ? "Adding…" : "Add"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
