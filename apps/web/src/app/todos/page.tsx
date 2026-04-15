"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { api } from "@/trpc/react";

type Priority = "low" | "medium" | "high";

const PRIORITY_DOT: Record<Priority, string> = {
  high:   "bg-red-500",
  medium: "bg-amber-400",
  low:    "bg-gray-600",
};

const PRIORITY_BADGE: Record<Priority, string> = {
  high:   "bg-red-950/40 text-red-400 border-red-800/50",
  medium: "bg-amber-950/30 text-amber-400 border-amber-800/40",
  low:    "bg-gray-800 text-gray-500 border-gray-700",
};

function isOverdue(dueDate: string | null | undefined) {
  if (!dueDate) return false;
  return dueDate < new Date().toISOString().slice(0, 10);
}

// ── Add form ──────────────────────────────────────────────────────────────────

function AddForm({ onAdd }: { onAdd: () => void }) {
  const t = useTranslations("todos");
  const [title,       setTitle]       = useState("");
  const [description, setDescription] = useState("");
  const [dueDate,     setDueDate]     = useState("");
  const [priority,    setPriority]    = useState<Priority>("medium");
  const [expanded,    setExpanded]    = useState(false);

  const create = api.todos.create.useMutation({
    onSuccess: () => {
      setTitle(""); setDescription(""); setDueDate(""); setPriority("medium"); setExpanded(false);
      onAdd();
    },
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    create.mutate({
      title,
      description: description || undefined,
      dueDate:     dueDate     || undefined,
      priority,
    });
  }

  return (
    <form onSubmit={handleSubmit} className="card px-5 py-4 space-y-3">
      <div className="flex gap-2">
        <input
          className="form-input flex-1"
          placeholder={t("addPlaceholder")}
          value={title}
          onChange={(e) => { setTitle(e.target.value); if (e.target.value) setExpanded(true); }}
          onFocus={() => setExpanded(true)}
        />
        <button
          type="submit"
          disabled={!title.trim() || create.isPending}
          className="px-4 py-2 rounded-xl bg-brand-500/20 text-brand-400 border border-brand-500/30 hover:bg-brand-500/30 text-sm font-semibold transition-colors disabled:opacity-40"
        >
          {t("addBtn")}
        </button>
      </div>

      {expanded && (
        <div className="space-y-3 pt-1 border-t border-gray-800">
          <textarea
            className="form-input text-sm resize-none"
            placeholder={t("descriptionPlaceholder")}
            rows={2}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
          <div className="flex gap-3">
            <div className="flex-1">
              <label className="form-label">{t("dueDate")}</label>
              <input
                type="date"
                className="form-input text-sm"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
              />
            </div>
            <div className="flex-1">
              <label className="form-label">{t("priority")}</label>
              <select
                className="form-input text-sm"
                value={priority}
                onChange={(e) => setPriority(e.target.value as Priority)}
              >
                <option value="high">{t("priorityHigh")}</option>
                <option value="medium">{t("priorityMedium")}</option>
                <option value="low">{t("priorityLow")}</option>
              </select>
            </div>
          </div>
        </div>
      )}
    </form>
  );
}

// ── Todo row ──────────────────────────────────────────────────────────────────

function TodoRow({ todo, onMutate }: {
  todo: {
    id: string;
    title: string;
    description: string | null;
    completed: boolean;
    dueDate: string | null;
    priority: string;
  };
  onMutate: () => void;
}) {
  const t = useTranslations("todos");
  const [editing, setEditing] = useState(false);
  const [editTitle, setEditTitle] = useState(todo.title);

  const toggle = api.todos.toggle.useMutation({ onSuccess: onMutate });
  const del    = api.todos.delete.useMutation({ onSuccess: onMutate });
  const update = api.todos.update.useMutation({
    onSuccess: () => { setEditing(false); onMutate(); },
  });

  const priority = (todo.priority as Priority) in PRIORITY_DOT
    ? (todo.priority as Priority)
    : "medium";

  const priorityLabels: Record<Priority, string> = {
    high:   t("priorityHigh"),
    medium: t("priorityMedium"),
    low:    t("priorityLow"),
  };

  const overdue = !todo.completed && isOverdue(todo.dueDate);

  function saveEdit() {
    if (editTitle.trim() && editTitle.trim() !== todo.title) {
      update.mutate({ id: todo.id, title: editTitle.trim() });
    } else {
      setEditing(false);
    }
  }

  return (
    <div className={`flex items-start gap-3 px-4 py-3 border-b border-gray-800 last:border-0 group ${todo.completed ? "opacity-50" : ""}`}>
      {/* Checkbox */}
      <button
        onClick={() => toggle.mutate({ id: todo.id })}
        disabled={toggle.isPending}
        className={`mt-0.5 w-5 h-5 rounded border-2 flex-shrink-0 flex items-center justify-center transition-colors ${
          todo.completed
            ? "bg-brand-500/30 border-brand-500/50"
            : "border-gray-600 hover:border-brand-500/60"
        }`}
        aria-label={todo.completed ? t("markIncomplete") : t("markComplete")}
      >
        {todo.completed && <span className="text-brand-400 text-xs leading-none">✓</span>}
      </button>

      {/* Content */}
      <div className="flex-1 min-w-0">
        {editing ? (
          <input
            className="form-input text-sm w-full"
            value={editTitle}
            onChange={(e) => setEditTitle(e.target.value)}
            onBlur={saveEdit}
            onKeyDown={(e) => { if (e.key === "Enter") saveEdit(); if (e.key === "Escape") setEditing(false); }}
            autoFocus
          />
        ) : (
          <p
            className={`text-sm font-medium cursor-text ${todo.completed ? "line-through text-gray-600" : "text-gray-200"}`}
            onClick={() => { if (!todo.completed) { setEditing(true); setEditTitle(todo.title); } }}
          >
            {todo.title}
          </p>
        )}
        {todo.description && (
          <p className="text-xs text-gray-600 mt-0.5 line-clamp-2">{todo.description}</p>
        )}
        <div className="flex items-center gap-2 mt-1 flex-wrap">
          <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded border ${PRIORITY_BADGE[priority]}`}>
            <span className={`inline-block w-1.5 h-1.5 rounded-full ${PRIORITY_DOT[priority]} mr-1`} />
            {priorityLabels[priority]}
          </span>
          {todo.dueDate && (
            <span className={`text-[10px] ${overdue ? "text-red-400 font-semibold" : "text-gray-600"}`}>
              {overdue ? t("overdue") : t("due")}{todo.dueDate}
            </span>
          )}
        </div>
      </div>

      {/* Delete */}
      <button
        onClick={() => del.mutate({ id: todo.id })}
        disabled={del.isPending}
        className="flex-shrink-0 opacity-0 group-hover:opacity-100 p-1.5 rounded-lg text-gray-700 hover:text-red-400 hover:bg-red-950/30 transition-all"
        aria-label={t("deleteTask")}
      >
        ✕
      </button>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

type Filter = "all" | "active" | "completed";

export default function TodosPage() {
  const t = useTranslations("todos");
  const [filter, setFilter] = useState<Filter>("all");
  const { data: allTodos = [], refetch, isLoading } = api.todos.list.useQuery();

  const visible = allTodos.filter((todo) =>
    filter === "all"       ? true :
    filter === "active"    ? !todo.completed :
                              todo.completed
  );

  const activeCount    = allTodos.filter((td) => !td.completed).length;
  const completedCount = allTodos.filter((td) => td.completed).length;

  const filterLabels: Record<Filter, string> = {
    all:       t("filterAll"),
    active:    t("filterActive"),
    completed: t("filterCompleted"),
  };

  const remainingText = activeCount === 1
    ? t("remaining").replace("{count}", "1")
    : t("remainingPlural").replace("{count}", String(activeCount));

  return (
    <div className="max-w-2xl mx-auto space-y-5 pb-10">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h2 className="page-title">{t("title")}</h2>
          <p className="text-gray-500 mt-1">{remainingText}</p>
        </div>
        {completedCount > 0 && (
          <span className="text-xs text-gray-700">
            {t("completed").replace("{count}", String(completedCount))}
          </span>
        )}
      </div>

      <AddForm onAdd={() => refetch()} />

      {/* Filter tabs */}
      <div className="flex gap-1 bg-gray-900 border border-gray-800 rounded-xl p-1">
        {(["all", "active", "completed"] as Filter[]).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`flex-1 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              filter === f
                ? "bg-brand-500/20 text-brand-400 border border-brand-500/30"
                : "text-gray-600 hover:text-gray-400"
            }`}
          >
            {filterLabels[f]}
          </button>
        ))}
      </div>

      {/* List */}
      <div className="card overflow-hidden">
        {isLoading ? (
          <p className="px-5 py-8 text-sm text-gray-600 text-center animate-pulse">{t("loading")}</p>
        ) : visible.length === 0 ? (
          <p className="px-5 py-8 text-sm text-gray-600 text-center">
            {filter === "completed" ? t("noCompleted") :
             filter === "active"    ? t("noActive") :
                                      t("noTasks")}
          </p>
        ) : (
          visible.map((todo) => (
            <TodoRow key={todo.id} todo={todo} onMutate={() => refetch()} />
          ))
        )}
      </div>
    </div>
  );
}
