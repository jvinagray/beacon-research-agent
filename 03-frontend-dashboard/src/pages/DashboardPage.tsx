import { useState } from "react";
import DashboardHeader from "@/components/DashboardHeader";
import TabNavigation, { type TabId } from "@/components/TabNavigation";
import SourceCard from "@/components/SourceCard";
import MarkdownViewer from "@/components/MarkdownViewer";
import ConceptMapContainer from "@/components/ConceptMapContainer";
import FlashCard from "@/components/FlashCard";

const mockSources = [
  { title: "Transformer Architecture Explained", url: "#", score: 9, contentType: "Article", timeEstimate: "8 min", keyInsight: "Attention mechanisms allow models to weigh the importance of different input tokens dynamically.", details: "The paper 'Attention Is All You Need' introduced the transformer architecture that replaced recurrent layers entirely with self-attention." },
  { title: "Neural Network Fundamentals", url: "#", score: 7, contentType: "Video", timeEstimate: "12 min", keyInsight: "Backpropagation computes gradients layer by layer to update weights efficiently.", details: "Covers activation functions, loss landscapes, and gradient descent variants." },
  { title: "GPT-4 Technical Report", url: "#", score: 8, contentType: "Paper", timeEstimate: "25 min", keyInsight: "Scaling laws predict model performance as a function of compute, data, and parameters." },
  { title: "Outdated ML Overview", url: "#", score: 3, contentType: "Blog", timeEstimate: "5 min", keyInsight: "Basic overview of machine learning concepts from 2015.", failed: true },
  { title: "Embeddings and Vector Databases", url: "#", score: 6, contentType: "Tutorial", timeEstimate: "10 min", keyInsight: "Dense vector representations capture semantic meaning for similarity search." },
].sort((a, b) => b.score - a.score);

const mockSummary = `
<h1>Research Summary: Transformer Models</h1>
<h2>Overview</h2>
<p>Transformer models have revolutionized natural language processing by introducing self-attention mechanisms that process all tokens in parallel, replacing the sequential nature of RNNs and LSTMs.</p>
<h2>Key Findings</h2>
<ul>
<li><strong>Self-attention</strong> allows each token to attend to every other token in the sequence</li>
<li><strong>Scaling laws</strong> show predictable performance improvements with more compute and data</li>
<li><strong>Transfer learning</strong> via pre-training enables strong performance on downstream tasks</li>
</ul>
<h2>Implications</h2>
<p>The transformer architecture has become the foundation for modern LLMs, enabling applications from code generation to scientific reasoning. Future work focuses on efficiency improvements and multimodal capabilities.</p>
`;

const mockFlashcards = [
  { question: "What is the core mechanism that replaced recurrence in Transformers?", answer: "Self-attention (scaled dot-product attention) allows each token to attend to all other tokens in parallel." },
  { question: "What are the three matrices used in attention computation?", answer: "Query (Q), Key (K), and Value (V) matrices, derived from learned linear projections." },
  { question: "What is the purpose of positional encoding?", answer: "Since transformers have no inherent notion of sequence order, positional encodings inject position information into the input embeddings." },
  { question: "What do scaling laws predict?", answer: "Model performance (loss) as a smooth function of compute budget, dataset size, and parameter count." },
  { question: "What is the difference between encoder and decoder in transformers?", answer: "Encoders process the full input bidirectionally; decoders generate output auto-regressively with masked attention." },
  { question: "What is multi-head attention?", answer: "Running multiple attention operations in parallel with different learned projections, then concatenating results for richer representations." },
];

const DashboardPage = () => {
  const [activeTab, setActiveTab] = useState<TabId>("sources");

  return (
    <div className="min-h-screen flex flex-col">
      <DashboardHeader topic="Transformer Models" />
      <TabNavigation active={activeTab} onChange={setActiveTab} />

      <main className="flex-1 p-6 max-w-5xl mx-auto w-full">
        {activeTab === "sources" && (
          <div className="space-y-4 animate-fade-in">
            <p className="text-sm text-muted-foreground">
              {mockSources.length} sources evaluated | Research: <span className="text-foreground">Transformer Models</span>
            </p>
            <div className="grid gap-3">
              {mockSources.map((source, i) => (
                <SourceCard key={i} {...source} />
              ))}
            </div>
          </div>
        )}

        {activeTab === "summary" && (
          <div className="animate-fade-in">
            <MarkdownViewer content={mockSummary} />
          </div>
        )}

        {activeTab === "concept-map" && (
          <div className="animate-fade-in">
            <ConceptMapContainer />
          </div>
        )}

        {activeTab === "flashcards" && (
          <div className="animate-fade-in">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {mockFlashcards.map((card, i) => (
                <FlashCard
                  key={i}
                  question={card.question}
                  answer={card.answer}
                  index={i}
                  total={mockFlashcards.length}
                />
              ))}
            </div>
          </div>
        )}
      </main>
    </div>
  );
};

export default DashboardPage;
