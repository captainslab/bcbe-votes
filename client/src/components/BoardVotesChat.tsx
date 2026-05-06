import { useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api/client";

type ChatCitation = {
  label: string;
  path?: string;
};

type ChatApiResponse = {
  answer: string;
  citations: ChatCitation[];
  suggestions: string[];
  scope: "answered" | "refused" | "fallback";
  modelUsed: "approved-faq" | "gpt-5-nano" | "setup-required";
};

type ChatMessage = {
  id: string;
  role: "visitor" | "assistant";
  text: string;
  citations?: ChatCitation[];
};

const starterQuestions = [
  "What is BoardVotes.io?",
  "What years are covered?",
  "What does Needs Review mean?",
  "What does Voting Alignment mean?",
];

const safeFallback = "I don’t know from BoardVotes.io data.";

const askBoardVotesAssistant = async (
  question: string,
  previousQuestion?: string,
  previousAssistantAnswer?: string,
): Promise<ChatApiResponse> => {
  const response = await api.post<ChatApiResponse>("/chat", { question, previousQuestion, previousAssistantAnswer });
  return response.data;
};

export const BoardVotesChat = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [question, setQuestion] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: "welcome",
      role: "assistant",
      text: "I’m the BoardVotes.io assistant. Ask me about site coverage, review labels, public pages, and how to read the data.",
    },
  ]);
  const formRef = useRef<HTMLFormElement>(null);

  const latestSuggestions = useMemo(() => starterQuestions, []);

  const submitQuestion = async (rawQuestion: string) => {
    const trimmed = rawQuestion.trim();
    if (!trimmed || isSending) return;

    setQuestion("");
    setIsSending(true);
    const visitorMessage: ChatMessage = {
      id: `visitor-${Date.now()}`,
      role: "visitor",
      text: trimmed,
    };
    setMessages((current) => [...current, visitorMessage]);

    try {
      const previousVisitorMessage = [...messages].reverse().find((message) => message.role === "visitor");
      const previousAssistantMessage = [...messages].reverse().find(
        (message) => message.role === "assistant" && message.id !== "welcome",
      );
      const answer = await askBoardVotesAssistant(trimmed, previousVisitorMessage?.text, previousAssistantMessage?.text);
      setMessages((current) => [
        ...current,
        {
          id: `assistant-${Date.now()}`,
          role: "assistant",
          text: answer.answer || safeFallback,
          citations: answer.citations,
        },
      ]);
    } catch {
      setMessages((current) => [
        ...current,
        {
          id: `assistant-${Date.now()}`,
          role: "assistant",
          text: "The BoardVotes.io assistant is unavailable right now. Try the public Votes, Members, Meetings, or Voting Alignment pages.",
          citations: [
            { label: "Votes", path: "/votes" },
            { label: "Members", path: "/members" },
            { label: "Meetings", path: "/meetings" },
          ],
        },
      ]);
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div className="fixed bottom-4 right-4 z-50 sm:bottom-6 sm:right-6">
      {isOpen ? (
        <section
          className="flex max-h-[82vh] w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl sm:w-96"
          aria-label="BoardVotes.io assistant chat"
        >
          <div className="flex items-start justify-between gap-3 border-b border-slate-200 bg-slate-950 px-4 py-3 text-white">
            <div>
              <h2 className="text-sm font-semibold">BoardVotes.io assistant</h2>
              <p className="text-xs text-slate-300">Site and data questions only.</p>
            </div>
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="rounded-full px-2 py-1 text-sm text-slate-200 transition hover:bg-white/10"
              aria-label="Close BoardVotes.io assistant"
            >
              Close
            </button>
          </div>

          <div className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
            {messages.map((message) => (
              <div key={message.id} className={message.role === "visitor" ? "text-right" : "text-left"}>
                <div
                  className={`inline-block max-w-[90%] rounded-2xl px-3 py-2 text-sm leading-relaxed ${
                    message.role === "visitor" ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-800"
                  }`}
                >
                  {message.text}
                </div>
                {message.citations && message.citations.length > 0 ? (
                  <div className="mt-1 flex flex-wrap gap-1 text-xs text-slate-500">
                    {message.citations.map((citation) =>
                      citation.path ? (
                        <Link
                          key={`${message.id}-${citation.label}`}
                          to={citation.path}
                          className="rounded-full bg-slate-50 px-2 py-1 hover:bg-slate-100"
                          onClick={() => setIsOpen(false)}
                        >
                          {citation.label}
                        </Link>
                      ) : (
                        <span key={`${message.id}-${citation.label}`} className="rounded-full bg-slate-50 px-2 py-1">
                          {citation.label}
                        </span>
                      ),
                    )}
                  </div>
                ) : null}
              </div>
            ))}
            {isSending ? <p className="text-xs text-slate-500">Checking approved BoardVotes.io context…</p> : null}
          </div>

          <div className="border-t border-slate-200 bg-slate-50 px-4 py-3">
            <div className="mb-3 flex flex-wrap gap-2">
              {latestSuggestions.map((starter) => (
                <button
                  key={starter}
                  type="button"
                  onClick={() => submitQuestion(starter)}
                  className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs text-slate-700 transition hover:border-slate-300 hover:bg-slate-100"
                  disabled={isSending}
                >
                  {starter}
                </button>
              ))}
            </div>
            <form
              ref={formRef}
              className="flex gap-2"
              onSubmit={(event) => {
                event.preventDefault();
                submitQuestion(question);
              }}
            >
              <input
                value={question}
                onChange={(event) => setQuestion(event.target.value)}
                maxLength={500}
                placeholder="Ask about the site or data"
                className="min-w-0 flex-1 rounded-full border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-700"
                aria-label="Ask the BoardVotes.io assistant"
              />
              <button
                type="submit"
                disabled={isSending || !question.trim()}
                className="rounded-full bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:bg-slate-400"
              >
                Send
              </button>
            </form>
            <p className="mt-2 text-[11px] leading-relaxed text-slate-500">
              Answers are limited to approved BoardVotes.io information and public site data.
            </p>
          </div>
        </section>
      ) : (
        <button
          type="button"
          onClick={() => setIsOpen(true)}
          className="rounded-full bg-slate-950 px-4 py-3 text-sm font-semibold text-white shadow-xl transition hover:bg-slate-800"
          aria-label="Open BoardVotes.io assistant"
        >
          Ask BoardVotes.io
        </button>
      )}
    </div>
  );
};
