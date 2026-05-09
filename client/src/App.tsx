import { BrowserRouter, Routes, Route } from "react-router-dom";
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

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Landing />} />
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
          <Route path="/support" element={<Donate />} />
          <Route path="/donate" element={<Donate />} />
          <Route path="/boards" element={<Boards />} />
          <Route path="/boards/:slug" element={<BoardDetail />} />
        </Route>
      </Routes>
      <BoardVotesChat />
    </BrowserRouter>
  );
}

export default App;
