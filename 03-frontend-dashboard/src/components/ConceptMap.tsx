import { parseConceptMap } from "../lib/conceptMapParser";
import MindMapNode from "./MindMapNode";
import MarkdownViewer from "./MarkdownViewer";

interface ConceptMapProps {
  data: string;
}

const ConceptMap = ({ data }: ConceptMapProps) => {
  const tree = parseConceptMap(data);

  if (!data) {
    return (
      <div>
        <p className="text-amber-400 mb-4">
          No concept map data available.
        </p>
      </div>
    );
  }

  if (!tree) {
    return (
      <div>
        <p className="text-amber-400 mb-4">
          Could not visualize concept map. Showing raw data:
        </p>
        <MarkdownViewer content={data} />
      </div>
    );
  }

  return (
    <div className="max-h-[80vh] overflow-y-auto glass rounded-lg p-6">
      <MindMapNode node={tree} depth={0} />
    </div>
  );
};

export default ConceptMap;
