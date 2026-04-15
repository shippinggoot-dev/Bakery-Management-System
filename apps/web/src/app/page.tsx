"use client";

import { useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { api } from "@/trpc/react";

function today() { return new Date().toISOString().slice(0, 10); }

function startOf(unit: "week" | "month") {
  const d = new Date();
  if (unit === "week") { const day = d.getDay(); d.setDate(d.getDate() - day); }
  else { d.setDate(1); }
  d.setHours(0, 0, 0, 0);
  return d;
}

function StatCard({ label, value, href, unit }: { label: string; value: number | string; href: string; unit?: string }) {
  return (
    <Link href={href} className="stat-card hover:border-brand-200 hover:shadow transition-all">
      <p className="text-xs text-brand-400 font-medium leading-tight">{label}</p>
      <p className="text-3xl font-bold text-brand-700 leading-none mt-1">
        {value}{unit && <span className="text-lg font-normal text-brand-400 ml-1">{unit}</span>}
      </p>
    </Link>
  );
}

function TasksWidget() {
  const t = useTranslations("dashboard");
  const [newTitle, setNewTitle] = useState("");
  const { data: todos = [], refetch } = api.todos.list.useQuery();
  const create = api.todos.create.useMutation({ onSuccess: () => { setNewTitle(""); refetch(); } });
  const toggle = api.todos.toggle.useMutation({ onSuccess: () => refetch() });
  const active = todos.filter((td) => !td.completed).slice(0, 8);

  return (
    <div className="card overflow-hidden flex flex-col h-full">
      <div className="flex items-center justify-between px-4 py-3 border-b border-rose-100">
        <p className="section-title">{t("todaysTasks")}</p>
        <Link href="/todos" className="text-xs text-brand-500 hover:text-brand-700 font-medium">{t("allTasks")}</Link>
      </div>
      <div className="flex gap-2 px-3 py-2.5 border-b border-rose-100">
        <input
          className="flex-1 text-sm bg-rose-50 border border-rose-200 rounded-lg px-3 py-1.5 text-gray-800 placeholder-brand-300 focus:outline-none focus:border-brand-400 focus:ring-1 focus:ring-brand-200"
          placeholder={t("quickAdd")}
          value={newTitle}
          onChange={(e) => setNewTitle(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && newTitle.trim()) create.mutate({ title: newTitle.trim() }); }}
        />
        <button
          onClick={() => { if (newTitle.trim()) create.mutate({ title: newTitle.trim() }); }}
          disabled={!newTitle.trim() || create.isPending}
          className="px-3 py-1.5 rounded-lg bg-brand-600 text-white text-xs font-semibold hover:bg-brand-700 transition-colors disabled:opacity-40"
        >{t("addBtn")}</button>
      </div>
      <div className="flex-1 overflow-y-auto divide-y divide-rose-50">
        {active.length === 0 ? (
          <p className="px-4 py-6 text-sm text-brand-300 text-center">{t("noTasks")}</p>
        ) : active.map((td) => (
          <label key={td.id} className="flex items-center gap-3 px-4 py-2.5 cursor-pointer hover:bg-rose-50 transition-colors">
            <input type="checkbox" checked={td.completed} onChange={() => toggle.mutate({ id: td.id })}
              className="w-4 h-4 rounded border-2 border-brand-300 accent-brand-600 flex-shrink-0" />
            <span className="text-sm text-gray-800 truncate">{td.title}</span>
            {td.dueDate && td.dueDate < today() && (
              <span className="text-[10px] text-red-400 flex-shrink-0">{t("noTasks").includes("overdue") ? "overdue" : "overdue"}</span>
            )}
          </label>
        ))}
      </div>
    </div>
  );
}

function ThisWeekWidget() {
  const t = useTranslations("dashboard");
  const { data: orders = [] } = api.purchaseOrders.getAll.useQuery({ limit: 20 });
  const weekStart = startOf("week");
  const thisWeek  = orders.filter((o) => new Date(o.createdAt) >= weekStart).slice(0, 6);

  return (
    <div className="card overflow-hidden flex flex-col h-full">
      <div className="flex items-center justify-between px-4 py-3 border-b border-rose-100">
        <p className="section-title">{t("thisWeek")}</p>
        <Link href="/purchase-orders" className="text-xs text-brand-500 hover:text-brand-700 font-medium">{t("allOrders")}</Link>
      </div>
      <div className="flex-1 overflow-y-auto">
        <div className="grid grid-cols-3 px-4 py-2 border-b border-rose-100 bg-rose-50">
          <p className="text-xs font-semibold text-brand-400 uppercase tracking-wider">{t("supplierCol")}</p>
          <p className="text-xs font-semibold text-brand-400 uppercase tracking-wider">{t("statusCol")}</p>
          <p className="text-xs font-semibold text-brand-400 uppercase tracking-wider">{t("dateCol")}</p>
        </div>
        {thisWeek.length === 0 ? (
          <p className="px-4 py-6 text-sm text-brand-300 text-center">{t("noOrders")}</p>
        ) : thisWeek.map((o) => (
          <Link key={o.id} href="/purchase-orders"
            className="grid grid-cols-3 px-4 py-3 border-b border-rose-50 last:border-0 hover:bg-rose-50 transition-colors">
            <p className="text-sm text-gray-800 truncate">{o.supplier?.name ?? "—"}</p>
            <p className="text-sm">
              <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                o.status === "delivered" ? "bg-green-100 text-green-700" :
                o.status === "sent"      ? "bg-blue-100 text-blue-700" :
                o.status === "confirmed" ? "bg-amber-100 text-amber-700" :
                o.status === "cancelled" ? "bg-red-100 text-red-600" :
                                           "bg-rose-100 text-brand-600"
              }`}>{o.status}</span>
            </p>
            <p className="text-sm text-brand-400">
              {new Date(o.createdAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
            </p>
          </Link>
        ))}
      </div>
    </div>
  );
}

function ShoppingWidget() {
  const t = useTranslations("dashboard");
  const [newName, setNewName] = useState("");
  const { data: lists = [], refetch } = api.shoppingLists.getAll.useQuery({ limit: 10 });
  const create = api.shoppingLists.create.useMutation({ onSuccess: () => { setNewName(""); refetch(); } });
  const open = lists.filter((l) => l.status !== "completed").slice(0, 7);

  return (
    <div className="card overflow-hidden flex flex-col h-full">
      <div className="flex items-center justify-between px-4 py-3 border-b border-rose-100">
        <p className="section-title">{t("shoppingList")}</p>
        <Link href="/shopping-lists" className="text-xs text-brand-500 hover:text-brand-700 font-medium">{t("allLists")}</Link>
      </div>
      <div className="flex gap-2 px-3 py-2.5 border-b border-rose-100">
        <input
          className="flex-1 text-sm bg-rose-50 border border-rose-200 rounded-lg px-3 py-1.5 text-gray-800 placeholder-brand-300 focus:outline-none focus:border-brand-400 focus:ring-1 focus:ring-brand-200"
          placeholder={t("quickAdd")}
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && newName.trim()) create.mutate({ name: newName.trim() }); }}
        />
        <button
          onClick={() => { if (newName.trim()) create.mutate({ name: newName.trim() }); }}
          disabled={!newName.trim() || create.isPending}
          className="px-3 py-1.5 rounded-lg bg-brand-600 text-white text-xs font-semibold hover:bg-brand-700 transition-colors disabled:opacity-40"
        >{t("addBtn")}</button>
      </div>
      <div className="flex-1 overflow-y-auto divide-y divide-rose-50">
        {open.length === 0 ? (
          <p className="px-4 py-6 text-sm text-brand-300 text-center">{t("noLists")}</p>
        ) : open.map((l) => (
          <Link key={l.id} href="/shopping-lists" className="flex items-center gap-3 px-4 py-2.5 hover:bg-rose-50 transition-colors">
            <span className="w-3.5 h-3.5 rounded-full border-2 border-brand-300 flex-shrink-0" />
            <span className="text-sm text-gray-800 flex-1 truncate">{l.name}</span>
            <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${
              l.status === "draft" ? "bg-rose-100 text-brand-500" : "bg-amber-100 text-amber-700"
            }`}>{l.status}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const t = useTranslations("dashboard");
  const { data: orders        = [] } = api.purchaseOrders.getAll.useQuery({ limit: 100 });
  const { data: todos         = [] } = api.todos.list.useQuery();
  const { data: shoppingLists = [] } = api.shoppingLists.getAll.useQuery({ limit: 100 });

  const todayStr   = today();
  const weekStart  = startOf("week");
  const monthStart = startOf("month");

  const ordersThisMonth = orders.filter((o) => new Date(o.createdAt) >= monthStart).length;
  const ordersThisWeek  = orders.filter((o) => new Date(o.createdAt) >= weekStart).length;
  const invoiceCount    = orders.filter((o) => o.status === "sent" || o.status === "confirmed").length;
  const todaysTodos     = todos.filter((td) => !td.completed && (td.dueDate === todayStr || !td.dueDate)).length;
  const openLists       = shoppingLists.filter((l) => l.status !== "completed").length;

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        <StatCard label={t("totalOrdersMonth")} value={ordersThisMonth} href="/purchase-orders" />
        <StatCard label={t("ordersThisWeek")}   value={ordersThisWeek}  href="/purchase-orders" />
        <StatCard label={t("invoicesSent")}      value={invoiceCount}    href="/purchase-orders" />
        <StatCard label={t("todaysTodosLabel")} value={todaysTodos}     href="/todos" />
        <StatCard label={t("shoppingListStat")} value={openLists}       href="/shopping-lists" />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4" style={{ minHeight: "340px" }}>
        <TasksWidget />
        <ThisWeekWidget />
        <ShoppingWidget />
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { key: "newOrder",       href: "/purchase-orders" },
          { key: "costCheck",      href: "/ingredients"     },
          { key: "customers",      href: "/customers"       },
          { key: "contentPlanner", href: "/recipes"         },
        ].map(({ key, href }) => (
          <Link key={href} href={href}
            className="bg-white border border-rose-200 rounded-2xl px-4 py-3 text-sm font-medium text-brand-600 hover:bg-rose-50 hover:border-brand-300 transition-all text-center shadow-sm">
            {t(key as Parameters<typeof t>[0])}
          </Link>
        ))}
      </div>
    </div>
  );
}
