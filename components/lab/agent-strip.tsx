import { memo } from "react";
import type { Experiment } from "@/lib/types";

export const AgentStrip = memo(function AgentStrip({ latest, agentMode }: { latest?: Experiment; agentMode?: string }) {
  const agent = latest?.record.agent;
  const source = agent?.source || agentMode || "heuristic";
  return (
    <section className="agent" aria-label="Research agent">
      <div className="agent-mark" aria-hidden="true">
        <span />
        <span />
        <span />
      </div>
      <div className="agent-body">
        <p className="agent-label">
          Search strategy
          <span className="tag">{source}</span>
          {agent && <span className="tag tag-accent">{agent.strategy}</span>}
        </p>
        <p className="agent-text">
          {agent?.explanation ||
            "When a run starts, the strategy is chosen from the seed’s properties and reviewed every five generations: explore new fragments, or favor polar ones when logP overshoots the target."}
        </p>
      </div>
      <span className="agent-cadence">Reviewed every 5 generations</span>
    </section>
  );
});
