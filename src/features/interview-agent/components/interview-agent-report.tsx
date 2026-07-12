/** Agent interview report page. */
import { useCallback, useEffect, useState } from "react";
import { ArrowLeft, BarChart3, FileText, Loader2, RefreshCw, Star } from "lucide-react";
import { useRouter } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { getAgentSession } from "../api";
import type { AgentRoleId, AgentSnapshot } from "../types";
import { AGENT_PHASE_DISPLAY, AGENT_ROLE_DISPLAY } from "../types";

type AgentReportState = { loading: boolean; error: string | null; snapshot: AgentSnapshot | null };

export type InterviewAgentReportProps = { sessionId: string };

export function InterviewAgentReport({ sessionId }: InterviewAgentReportProps) {
  const router = useRouter();
  const [state, setState] = useState<AgentReportState>({ loading: true, error: null, snapshot: null });

  const loadReport = useCallback(async () => {
    setState((prev) => ({ ...prev, loading: true, error: null }));
    try {
      const view = await getAgentSession(sessionId);
      setState({ loading: false, error: null, snapshot: view.snapshot });
    } catch (err) {
      setState({ loading: false, error: err instanceof Error ? err.message : "Failed to load report", snapshot: null });
    }
  }, [sessionId]);

  useEffect(() => { loadReport(); }, [loadReport]);

  const roleColor = (role: AgentRoleId): string => AGENT_ROLE_DISPLAY[role]?.color ?? "bg-gray-500";

  if (state.loading) {
    return <div className="flex items-center justify-center py-20"><Loader2 className="size-8 animate-spin text-muted-foreground" /></div>;
  }

  if (state.error) {
    return <div className="mx-auto max-w-lg py-12 text-center">
      <p className="text-destructive">{state.error}</p>
      <Button variant="outline" className="mt-4 min-h-11" onClick={loadReport}><RefreshCw /> Retry</Button>
    </div>;
  }

  const snapshot = state.snapshot;
  if (!snapshot) return null;
  const isCompleted = snapshot.phase === "completed";

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <header className="flex items-start gap-4">
        <Button variant="ghost" size="icon" onClick={() => router.history.back()}><ArrowLeft /></Button>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Agent Interview Report</h1>
          <p className="mt-1 text-sm text-muted-foreground">{isCompleted ? "Interview completed" : "Interview in progress"}</p>
        </div>
      </header>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><BarChart3 className="size-5" />Interview Status</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-1">
              <div className="text-xs text-muted-foreground">Phase</div>
              <Badge variant="outline" className="text-sm">{AGENT_PHASE_DISPLAY[snapshot.phase] ?? snapshot.phase}</Badge>
            </div>
            <div className="space-y-1">
              <div className="text-xs text-muted-foreground">Mode</div>
              <Badge variant="outline" className="text-sm">{snapshot.mode === "panel" ? "Panel" : "Single Interviewer"}</Badge>
            </div>
            <div className="space-y-1">
              <div className="text-xs text-muted-foreground">Questions</div>
              <span className="text-sm font-medium">{snapshot.currentQuestionIndex}</span>
            </div>
          </div>
          {snapshot.currentRole && (
            <div className="mt-4 flex items-center gap-2">
              <span className="text-xs text-muted-foreground">Current role:</span>
              <Badge className={roleColor(snapshot.currentRole) + " text-white"}>{AGENT_ROLE_DISPLAY[snapshot.currentRole]?.label ?? snapshot.currentRole}</Badge>
            </div>
          )}
        </CardContent>
      </Card>

      {isCompleted && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Star className="size-5 text-amber-500" />Overall Score</CardTitle>
            <CardDescription>Interview completed. Score has been generated.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-center py-8">
              <div className="text-center">
                <div className="text-5xl font-bold text-primary">--</div>
                <div className="mt-2 text-sm text-muted-foreground">Check the full report page for detailed scoring</div>
                <Button className="mt-4 min-h-11" asChild><a href={"/agent/" + sessionId}>Back to interview</a></Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {!isCompleted && (
        <Card>
          <CardContent className="py-8 text-center">
            <FileText className="mx-auto size-8 text-muted-foreground" />
            <h3 className="mt-3 font-semibold">Interview not yet completed</h3>
            <p className="mt-1 text-sm text-muted-foreground">Return to the interview page to complete it and generate a full report.</p>
            <Button className="mt-4 min-h-11" asChild><a href={"/agent/" + sessionId}>Continue interview</a></Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
