import { BrowserRouter, Routes, Route } from "react-router-dom";
import { Layout } from "./components/Layout";
import { Dashboard } from "./pages/Dashboard";
import { Votes } from "./pages/Votes";
import { VoteDetail } from "./pages/VoteDetail";
import { Members } from "./pages/Members";
import { MemberDetail } from "./pages/MemberDetail";
import { Meetings } from "./pages/Meetings";
import { MeetingDetail } from "./pages/MeetingDetail";
import { Alliances } from "./pages/Alliances";
import { Admin } from "./pages/Admin";
function App() {
  return (
    <BrowserRouter>
      <Layout>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/votes" element={<Votes />} />
          <Route path="/votes/:id" element={<VoteDetail />} />
          <Route path="/members" element={<Members />} />
          <Route path="/members/:id" element={<MemberDetail />} />
          <Route path="/meetings" element={<Meetings />} />
          <Route path="/meetings/:id" element={<MeetingDetail />} />
          <Route path="/alliances" element={<Alliances />} />
          <Route path="/admin" element={<Admin />} />
        </Routes>
      </Layout>
    </BrowserRouter>
  );
}

export default App;
