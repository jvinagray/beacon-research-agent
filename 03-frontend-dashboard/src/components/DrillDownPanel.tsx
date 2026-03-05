import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from "@/components/ui/accordion";
import MarkdownViewer from "@/components/MarkdownViewer";
import type { DrillDownSession } from "@/hooks/useDrillDown";
import type { EvaluatedSource } from "@/types/research";

interface DrillDownPanelProps {
  sessions: DrillDownSession[];
  sources: EvaluatedSource[];
  onDrillDown: (concept: string, parentId?: string) => void;
}

function SessionNode({
  session,
  allSessions,
  sources,
  onDrillDown,
}: {
  session: DrillDownSession;
  allSessions: DrillDownSession[];
  sources: EvaluatedSource[];
  onDrillDown: (concept: string, parentId?: string) => void;
}) {
  const childSessions = allSessions.filter((s) => s.parentId === session.id);

  return (
    <AccordionItem
      value={session.id}
      className="glass rounded-xl border border-glass-border mb-2"
    >
      <AccordionTrigger className="px-4 text-sm">
        <span className="flex items-center gap-2">
          {session.concept}
          {session.isStreaming && (
            <span className="inline-block animate-pulse">&#9610;</span>
          )}
        </span>
      </AccordionTrigger>
      <AccordionContent className="px-4">
        <MarkdownViewer
          content={session.content}
          sources={sources}
          onDrillDown={(concept) => onDrillDown(concept, session.id)}
        />
        {session.depth >= 2 && (
          <p className="text-xs text-muted-foreground mt-2">
            Maximum depth reached. Use the chat to explore further.
          </p>
        )}
        {childSessions.length > 0 && (
          <div className="border-l-2 border-primary/30 ml-4 mt-2">
            <Accordion type="multiple">
              {childSessions.map((child) => (
                <SessionNode
                  key={child.id}
                  session={child}
                  allSessions={allSessions}
                  sources={sources}
                  onDrillDown={onDrillDown}
                />
              ))}
            </Accordion>
          </div>
        )}
      </AccordionContent>
    </AccordionItem>
  );
}

const DrillDownPanel = ({
  sessions,
  sources,
  onDrillDown,
}: DrillDownPanelProps) => {
  const topLevel = sessions.filter((s) => s.parentId === null);

  if (topLevel.length === 0) return null;

  return (
    <Accordion type="multiple">
      {topLevel.map((session) => (
        <SessionNode
          key={session.id}
          session={session}
          allSessions={sessions}
          sources={sources}
          onDrillDown={onDrillDown}
        />
      ))}
    </Accordion>
  );
};

export default DrillDownPanel;
