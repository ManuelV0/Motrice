import { Suspense, lazy } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import AppShell from './layout/AppShell';
import LandingPage from './pages/LandingPage';
import ExplorePage from './pages/ExplorePage';
import ExploreFoldersEmbedPage from './pages/ExploreFoldersEmbedPage';
import FaqPage from './pages/FaqPage';
import EventDetailPage from './pages/EventDetailPage';
import CreateEventPage from './pages/CreateEventPage';
import MapPage from './pages/MapPage';
import ProfilePage from './pages/ProfilePage';
import NotFoundPage from './pages/NotFoundPage';
import AgendaPage from './pages/AgendaPage';
import NotificationsPage from './pages/NotificationsPage';
import LocalProfilePage from './pages/LocalProfilePage';
import AppErrorBoundary from './components/AppErrorBoundary';
import PricingPage from './pages/PricingPage';
import AccountPage from './pages/AccountPage';
import AccountXpPage from './pages/AccountXpPage';
import AccountAiPage from './pages/AccountAiPage';
import ConvenzioniPage from './pages/ConvenzioniPage';
import ConvenzioneVoucherPage from './pages/ConvenzioneVoucherPage';
import ConvenzioneAgreementGeneratorPage from './pages/ConvenzioneAgreementGeneratorPage';
import AdminConvenzioniApplicationsPage from './pages/AdminConvenzioniApplicationsPage';
import CoachPage from './features/coach/pages/CoachPage';
import CoachPlanPage from './features/coach/pages/CoachPlanPage';
import CoachCheckInPage from './features/coach/pages/CoachCheckInPage';
import CoachProfilePage from './features/coach/pages/CoachProfilePage';
import BecomeCoachApplyPage from './features/coach/pages/BecomeCoachApplyPage';
import CoachDashboardPage from './features/coach/pages/CoachDashboardPage';
import MyPlansPage from './features/coach/pages/MyPlansPage';
import LoginPage from './pages/LoginPage';
import AdminCoachApplicationsPage from './features/coach/pages/AdminCoachApplicationsPage';
import TutorialPage from './pages/TutorialPage';
import AdminTutorialPage from './pages/AdminTutorialPage';
import ChatHubPage from './pages/ChatHubPage';
import ChatInboxPage from './pages/ChatInboxPage';
import MetPeoplePage from './pages/MetPeoplePage';
import FocusProfilePage from './pages/FocusProfilePage';
import ChatThreadPage from './pages/ChatThreadPage';
import CommunityPage from './pages/CommunityPage';
import ChatSearchPage from './pages/ChatSearchPage';
import FriendsPage from './pages/FriendsPage';

const GameMapPage = lazy(() => import('./features/game/pages/GameMapPage'));

function App() {
  const location = useLocation();

  return (
    <AppErrorBoundary resetKey={location.pathname}>
      <AppShell>
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route path="/explore" element={<ExplorePage />} />
          <Route path="/embed/cartelle" element={<ExploreFoldersEmbedPage />} />
          <Route path="/faq" element={<FaqPage />} />
          <Route path="/tutorial" element={<TutorialPage />} />
          <Route path="/events/:id" element={<EventDetailPage />} />
          <Route path="/create" element={<CreateEventPage />} />
          <Route path="/agenda" element={<AgendaPage />} />
          <Route path="/notifications" element={<NotificationsPage />} />
          <Route path="/chat" element={<ChatHubPage />} />
          <Route path="/chat/inbox" element={<ChatInboxPage />} />
          <Route path="/chat/search" element={<ChatSearchPage />} />
          <Route path="/chat/friends" element={<FriendsPage />} />
          <Route path="/chat/met" element={<MetPeoplePage />} />
          <Route path="/chat/:threadId" element={<ChatThreadPage />} />
          <Route path="/chat/met-people" element={<Navigate to="/chat/met" replace />} />
          <Route path="/chat/met-people/:eventId" element={<MetPeoplePage />} />
          <Route path="/chat/focus/:userId" element={<FocusProfilePage />} />
          <Route path="/community" element={<CommunityPage />} />
          <Route path="/chatrice" element={<Navigate to="/chat" replace />} />
          <Route path="/chatrice/:threadId" element={<ChatThreadPage />} />
          <Route path="/map" element={<MapPage />} />
          <Route
            path="/game"
            element={
              <Suspense fallback={<main className="container">Caricamento Motrice Game...</main>}>
                <GameMapPage />
              </Suspense>
            }
          />
          <Route path="/pricing" element={<PricingPage />} />
          <Route path="/convenzioni" element={<ConvenzioniPage />} />
          <Route path="/admin/convenzioni-generator" element={<ConvenzioneAgreementGeneratorPage />} />
          <Route path="/convenzioni/voucher/:voucherId" element={<ConvenzioneVoucherPage />} />
          <Route path="/account" element={<AccountPage />} />
          <Route path="/account/xp" element={<AccountXpPage />} />
          <Route path="/account/ai" element={<AccountAiPage />} />
          <Route path="/coach" element={<CoachPage />} />
          <Route path="/coach/:id" element={<CoachProfilePage />} />
          <Route path="/become-coach" element={<BecomeCoachApplyPage />} />
          <Route path="/dashboard/coach" element={<CoachDashboardPage />} />
          <Route path="/dashboard/plans" element={<MyPlansPage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/admin/coach-applications" element={<AdminCoachApplicationsPage />} />
          <Route path="/admin/convenzioni-applications" element={<AdminConvenzioniApplicationsPage />} />
          <Route path="/admin/tutorial" element={<AdminTutorialPage />} />
          <Route path="/coach/plan" element={<CoachPlanPage />} />
          <Route path="/coach/check-in" element={<CoachCheckInPage />} />
          <Route path="/profile/me" element={<LocalProfilePage />} />
          <Route path="/profile/:id" element={<ProfilePage />} />
          <Route path="/404" element={<NotFoundPage />} />
          <Route path="*" element={<Navigate to="/404" replace />} />
        </Routes>
      </AppShell>
    </AppErrorBoundary>
  );
}

export default App;
