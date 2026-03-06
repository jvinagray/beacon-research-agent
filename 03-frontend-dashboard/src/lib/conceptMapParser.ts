export interface TreeNode {
  name: string;
  children?: TreeNode[];
}

/**
 * Parse a markdown indented bullet list into a tree data structure.
 * Supports both 2-space and 4-space indentation, bold (**text**) markers.
 */
export function parseConceptMap(markdown: string): TreeNode | null {
  if (!markdown || !markdown.trim()) return null;

  const lines = markdown.split("\n").filter((l) => l.trimEnd() !== "");
  const bulletLines: { indent: number; text: string }[] = [];

  for (const line of lines) {
    // Match leading whitespace
    const leadingMatch = line.match(/^(\s*)/);
    const rawIndent = leadingMatch ? leadingMatch[1].length : 0;

    // Must start with "- " after whitespace
    const trimmed = line.slice(rawIndent);
    if (!trimmed.startsWith("- ")) continue;

    // Extract text, strip bold markers
    let text = trimmed.slice(2).trim();
    text = text.replace(/\*\*/g, "");
    text = text.trim();
    if (!text) continue;

    bulletLines.push({ indent: rawIndent, text });
  }

  if (bulletLines.length === 0) return null;

  // Detect indent unit: find the smallest nonzero indent
  let indentUnit = 2;
  for (const bl of bulletLines) {
    if (bl.indent > 0) {
      indentUnit = bl.indent;
      break;
    }
  }

  // Normalize indentation to levels
  const items = bulletLines.map((bl) => ({
    level: Math.round(bl.indent / indentUnit),
    text: bl.text,
  }));

  // Build tree using a stack
  const roots: TreeNode[] = [];
  const stack: { node: TreeNode; level: number }[] = [];

  for (const item of items) {
    const node: TreeNode = { name: item.text };

    // Pop stack until we find a parent
    while (stack.length > 0 && stack[stack.length - 1].level >= item.level) {
      stack.pop();
    }

    if (stack.length === 0) {
      roots.push(node);
    } else {
      const parent = stack[stack.length - 1].node;
      if (!parent.children) parent.children = [];
      parent.children.push(node);
    }

    stack.push({ node, level: item.level });
  }

  if (roots.length === 0) return null;
  if (roots.length === 1) return roots[0];

  // Wrap multiple roots
  return { name: "Concept Map", children: roots };
}
