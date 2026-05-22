import { createContext, useContext, useEffect, useState, useMemo } from "react";
import { api } from "../api/client";

type BoardContextValue = {
  boardSlug: string | null;  // null = hub mode (boardvotes.io root)
  isHub: boolean;
  boardName: string;
};

const BoardContext = createContext<BoardContextValue>({ boardSlug: null, isHub: true, boardName: "BoardVotes" });

export function BoardProvider({ children }: { children: React.ReactNode }) {
  const { boardSlug, isHub } = useMemo(() => {
    const hostname = window.location.hostname;
    // Match *.boardvotes.io but not boardvotes.io itself
    const match = hostname.match(/^([^.]+)\.boardvotes\.io$/);
    // In dev (localhost), check for ?board= query param for testing
    const devBoard = new URLSearchParams(window.location.search).get("board");
    const boardSlug = match?.[1] ?? devBoard ?? null;
    return { boardSlug, isHub: boardSlug === null };
  }, []);

  const [boardName, setBoardName] = useState("BoardVotes");

  useEffect(() => {
    if (isHub) return; // Hub mode has no board-specific name
    api.get<{ slug: string | null; name: string; shortName?: string }>("/board")
      .then((res) => {
        if (res.data.name) setBoardName(res.data.name);
      })
      .catch(() => {
        // Leave default
      });
  }, [isHub]);

  return (
    <BoardContext.Provider value={{ boardSlug, isHub, boardName }}>
      {children}
    </BoardContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useBoardContext() {
  return useContext(BoardContext);
}
