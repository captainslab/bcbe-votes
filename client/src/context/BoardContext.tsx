import { createContext, useContext, useMemo } from "react";

type BoardContextValue = {
  boardSlug: string | null;  // null = hub mode (boardvotes.io root)
  isHub: boolean;
};

const BoardContext = createContext<BoardContextValue>({ boardSlug: null, isHub: true });

export function BoardProvider({ children }: { children: React.ReactNode }) {
  const value = useMemo(() => {
    const hostname = window.location.hostname;
    // Match *.boardvotes.io but not boardvotes.io itself
    const match = hostname.match(/^([^.]+)\.boardvotes\.io$/);
    // In dev (localhost), check for ?board= query param for testing
    const devBoard = new URLSearchParams(window.location.search).get("board");
    const boardSlug = match?.[1] ?? devBoard ?? null;
    return { boardSlug, isHub: boardSlug === null };
  }, []);

  return <BoardContext.Provider value={value}>{children}</BoardContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useBoardContext() {
  return useContext(BoardContext);
}
