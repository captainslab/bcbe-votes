import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { useBoardContext } from "./context/BoardContext";
import { Layout } from "./components/Layout";
import { Landing } from "./pages/Landing";
import { Dashboard } from "./pages/Dashboard";
import { Votes } from "./pages/Votes";
import { VoteDetail } from "./pages/VoteDetail";
import { Members } from "./pages/Members";
import { MemberDetail } from "./pages/MemberDetail";
import { Meetings } from "./pages/Meetings";
import { MeetingDetail } from "./pages/MeetingDetail";
import { Alliances } from "./pages/Alliances";
import { Admin } from "./pages/Admin";
import { Contact } from "./pages/Contact";
import { Request } from "./pages/Request";
import { Boards } from "./pages/Boards";
import { BoardDetail } from "./pages/BoardDetail";
import { Donate } from "./pages/Donate";
import { BoardVotesChat } from "./components/BoardVotesChat";
import { Faq } from "./pages/Faq";
import { Vendors } from "./pages/Vendors";
import { VendorDetail } from "./pages/VendorDetail";
import { ExecSessions } from "./pages/ExecSessions";
import { Transcripts } from "./pages/Transcripts";

function BoardRoot() {
  const { boardSlug } = useBoardContext();
  return boardSlug ? <Navigate to="/dashboard" replace /> : <Landing />;
}

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<BoardRoot />} />
        <Route element={<Layout />}>
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/votes" element={<Votes />} />
          <Route path="/votes/:id" element={<VoteDetail />} />
          <Route path="/members" element={<Members />} />
          <Route path="/members/:id" element={<MemberDetail />} />
          <Route path="/meetings" element={<Meetings />} />
          <Route path="/meetings/:id" element={<MeetingDetail />} />
          <Route path="/alliances" element={<Alliances />} />
          <Route path="/admin" element={<Admin />} />
          <Route path="/contact" element={<Contact />} />
          <Route path="/request" element={<Request />} />
          <Route path="/faq" element={<Faq />} />
          <Route path="/support" element={<Donate />} />
          <Route path="/donate" element={<Donate />} />
          <Route path="/boards" element={<Boards />} />
          <Route path="/boards/:slug" element={<BoardDetail />} />
          <Route path="/vendors" element={<Vendors />} />
          <Route path="/vendors/:slug" element={<VendorDetail />} />
          <Route path="/exec-sessions" element={<ExecSessions />} />
          <Route path="/transcripts" element={<Transcripts />} />
        </Route>
      </Routes>
      <BoardVotesChat />
    </BrowserRouter>
  );
}

export default App;
