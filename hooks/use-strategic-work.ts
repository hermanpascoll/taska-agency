"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/client";

export type Portfolio = {
  id: string;
  workspaceId: string;
  name: string;
  description: string;
  color: string;
  ownerId: string | null;
  projectIds: string[];
};

export type GoalStatus = "on_track" | "at_risk" | "off_track" | "complete";

export type Goal = {
  id: string;
  workspaceId: string;
  name: string;
  description: string;
  status: GoalStatus;
  progress: number;
  dueDate: string | null;
  ownerId: string | null;
  projectIds: string[];
};

export type PortfolioInput = Pick<
  Portfolio,
  "name" | "description" | "color" | "ownerId" | "projectIds"
>;

export type GoalInput = Pick<
  Goal,
  "name" | "description" | "status" | "progress" | "dueDate" | "ownerId" | "projectIds"
>;

const storageKey = "taska-strategic-work-v1";

type RemotePortfolio = {
  id: string;
  team_id: string;
  name: string;
  description: string;
  color: string;
  owner_id: string | null;
};

type RemoteGoal = {
  id: string;
  team_id: string;
  name: string;
  description: string;
  status: string;
  progress: number;
  due_date: string | null;
  owner_id: string | null;
};

type RemotePortfolioLink = { portfolio_id: string; project_id: string };
type RemoteGoalLink = { goal_id: string; project_id: string };

function readDemoSnapshot() {
  if (typeof window === "undefined") return { portfolios: [] as Portfolio[], goals: [] as Goal[] };
  try {
    const value = window.localStorage.getItem(storageKey);
    if (!value) return { portfolios: [] as Portfolio[], goals: [] as Goal[] };
    const parsed = JSON.parse(value) as { portfolios?: Portfolio[]; goals?: Goal[] };
    return {
      portfolios: Array.isArray(parsed.portfolios) ? parsed.portfolios : [],
      goals: Array.isArray(parsed.goals) ? parsed.goals : [],
    };
  } catch {
    return { portfolios: [] as Portfolio[], goals: [] as Goal[] };
  }
}

export function useStrategicWork(workspaceId: string) {
  const remote = isSupabaseConfigured();
  const [portfolios, setPortfolios] = useState<Portfolio[]>([]);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!workspaceId) {
      setPortfolios([]);
      setGoals([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    if (!remote) {
      const snapshot = readDemoSnapshot();
      setPortfolios(snapshot.portfolios);
      setGoals(snapshot.goals);
      setLoading(false);
      return;
    }

    const supabase = createClient();
    if (!supabase) return;
    const [portfolioResult, portfolioLinksResult, goalsResult, goalLinksResult] =
      await Promise.all([
        supabase
          .from("portfolios")
          .select("id, team_id, name, description, color, owner_id")
          .eq("team_id", workspaceId)
          .order("created_at"),
        supabase.from("portfolio_projects").select("portfolio_id, project_id"),
        supabase
          .from("goals")
          .select("id, team_id, name, description, status, progress, due_date, owner_id")
          .eq("team_id", workspaceId)
          .order("created_at"),
        supabase.from("goal_projects").select("goal_id, project_id"),
      ]);
    for (const result of [portfolioResult, portfolioLinksResult, goalsResult, goalLinksResult]) {
      if (result.error) throw result.error;
    }
    const portfolioLinks = (portfolioLinksResult.data ?? []) as RemotePortfolioLink[];
    const goalLinks = (goalLinksResult.data ?? []) as RemoteGoalLink[];
    setPortfolios(
      ((portfolioResult.data ?? []) as RemotePortfolio[]).map((item) => ({
        id: item.id,
        workspaceId: item.team_id,
        name: item.name,
        description: item.description,
        color: item.color,
        ownerId: item.owner_id,
        projectIds: portfolioLinks
          .filter((link) => link.portfolio_id === item.id)
          .map((link) => link.project_id),
      })),
    );
    setGoals(
      ((goalsResult.data ?? []) as RemoteGoal[]).map((item) => ({
        id: item.id,
        workspaceId: item.team_id,
        name: item.name,
        description: item.description,
        status: item.status as GoalStatus,
        progress: Number(item.progress),
        dueDate: item.due_date,
        ownerId: item.owner_id,
        projectIds: goalLinks
          .filter((link) => link.goal_id === item.id)
          .map((link) => link.project_id),
      })),
    );
    setLoading(false);
  }, [remote, workspaceId]);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      void refresh().catch((error) => {
        console.error("No se pudo cargar el trabajo estratégico:", error);
        setLoading(false);
      });
    }, 0);
    return () => window.clearTimeout(timeout);
  }, [refresh]);

  useEffect(() => {
    if (remote || loading) return;
    window.localStorage.setItem(storageKey, JSON.stringify({ portfolios, goals }));
  }, [goals, loading, portfolios, remote]);

  const workspacePortfolios = useMemo(
    () => portfolios.filter((item) => item.workspaceId === workspaceId),
    [portfolios, workspaceId],
  );
  const workspaceGoals = useMemo(
    () => goals.filter((item) => item.workspaceId === workspaceId),
    [goals, workspaceId],
  );

  const createPortfolio = useCallback(
    async (input: PortfolioInput) => {
      if (!remote) {
        const item: Portfolio = { id: crypto.randomUUID(), workspaceId, ...input };
        setPortfolios((current) => [...current, item]);
        return item;
      }
      const supabase = createClient();
      if (!supabase) throw new Error("Supabase no está configurado");
      const { data, error } = await supabase
        .from("portfolios")
        .insert({
          team_id: workspaceId,
          name: input.name,
          description: input.description,
          color: input.color,
          owner_id: input.ownerId,
        })
        .select("id")
        .single();
      if (error) throw error;
      if (input.projectIds.length) {
        const links = await supabase.from("portfolio_projects").insert(
          input.projectIds.map((projectId) => ({ portfolio_id: data.id, project_id: projectId })),
        );
        if (links.error) throw links.error;
      }
      await refresh();
      return data;
    },
    [refresh, remote, workspaceId],
  );

  const deletePortfolio = useCallback(async (id: string) => {
    if (!remote) {
      setPortfolios((current) => current.filter((item) => item.id !== id));
      return;
    }
    const supabase = createClient();
    if (!supabase) throw new Error("Supabase no está configurado");
    const result = await supabase.from("portfolios").delete().eq("id", id);
    if (result.error) throw result.error;
    await refresh();
  }, [refresh, remote]);

  const createGoal = useCallback(
    async (input: GoalInput) => {
      if (!remote) {
        const item: Goal = { id: crypto.randomUUID(), workspaceId, ...input };
        setGoals((current) => [...current, item]);
        return item;
      }
      const supabase = createClient();
      if (!supabase) throw new Error("Supabase no está configurado");
      const { data, error } = await supabase
        .from("goals")
        .insert({
          team_id: workspaceId,
          name: input.name,
          description: input.description,
          status: input.status,
          progress: input.progress,
          due_date: input.dueDate,
          owner_id: input.ownerId,
        })
        .select("id")
        .single();
      if (error) throw error;
      if (input.projectIds.length) {
        const links = await supabase.from("goal_projects").insert(
          input.projectIds.map((projectId) => ({ goal_id: data.id, project_id: projectId })),
        );
        if (links.error) throw links.error;
      }
      await refresh();
      return data;
    },
    [refresh, remote, workspaceId],
  );

  const updateGoalProgress = useCallback(async (id: string, progress: number) => {
    const normalized = Math.min(100, Math.max(0, Math.round(progress)));
    if (!remote) {
      setGoals((current) => current.map((goal) =>
        goal.id === id
          ? { ...goal, progress: normalized, status: normalized === 100 ? "complete" : goal.status }
          : goal,
      ));
      return;
    }
    const supabase = createClient();
    if (!supabase) throw new Error("Supabase no está configurado");
    const result = await supabase
      .from("goals")
      .update({ progress: normalized, ...(normalized === 100 ? { status: "complete" } : {}) })
      .eq("id", id);
    if (result.error) throw result.error;
    await refresh();
  }, [refresh, remote]);

  const deleteGoal = useCallback(async (id: string) => {
    if (!remote) {
      setGoals((current) => current.filter((item) => item.id !== id));
      return;
    }
    const supabase = createClient();
    if (!supabase) throw new Error("Supabase no está configurado");
    const result = await supabase.from("goals").delete().eq("id", id);
    if (result.error) throw result.error;
    await refresh();
  }, [refresh, remote]);

  return {
    portfolios: workspacePortfolios,
    goals: workspaceGoals,
    loading,
    createPortfolio,
    deletePortfolio,
    createGoal,
    updateGoalProgress,
    deleteGoal,
  };
}
