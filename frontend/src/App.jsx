import { Suspense, lazy } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import AppShell from './layout/AppShell';
import AppErrorBoundary from './components/AppErrorBoundary';
import VerifiedProfileRoute from './components/VerifiedProfileRoute';
import AdminVerificationRoute from './components/AdminVerificationRoute';
import RouteLoadingSkeleton from './components/RouteLoadingSkeleton';

// Each screen is downloaded only when its route is opened. This keeps heavy
// features such as maps, QR tools and admin dashboards out of the startup bundle.
const LandingPage = lazy(() => import('./pages/LandingPage'));
const ExplorePage = lazy(() => import('./pages/ExplorePage'));
const ExploreFoldersEmbedPage = lazy(() => import('./pages/ExploreFoldersEmbedPage'));
const FaqPage = lazy(() => import('./pages/FaqPage'));
const EventDetailPage = lazy(() => import('./pages/EventDetailPage'));
const CreateEventPage = lazy(() => import('./pages/CreateEventPage'));
const MapPage = lazy(() => import('./pages/MapPage'));
const ProfilePage = lazy(() => import('./pages/ProfilePage'));
const NotFoundPage = lazy(() => import('./pages/NotFoundPage'));
const AgendaPage = lazy(() => import('./pages/AgendaPage'));
const NotificationsPage = lazy(() => import('./pages/NotificationsPage'));
const PricingPage = lazy(() => import('./pages/PricingPage'));
const AccountPage = lazy(() => import('./pages/AccountPage'));
const AccountAiPage = lazy(() => import('./pages/AccountAiPage'));
const ConvenzioniPage = lazy(() => import('./pages/ConvenzioniPage'));
const ConvenzioneVoucherPage = lazy(() => import('./pages/ConvenzioneVoucherPage'));
const ConvenzioneAgreementGeneratorPage = lazy(() => import('./pages/ConvenzioneAgreementGeneratorPage'));
const AdminConvenzioniApplicationsPage = lazy(() => import('./pages/AdminConvenzioniApplicationsPage'));
const CoachPage = lazy(() => import('./features/coach/pages/CoachPage'));
const CoachPlanPage = lazy(() => import('./features/coach/pages/CoachPlanPage'));
const CoachCheckInPage = lazy(() => import('./features/coach/pages/CoachCheckInPage'));
const CoachProfilePage = lazy(() => import('./features/coach/pages/CoachProfilePage'));
const BecomeCoachApplyPage = lazy(() => import('./features/coach/pages/BecomeCoachApplyPage'));
const CoachDashboardPage = lazy(() => import('./features/coach/pages/CoachDashboardPage'));
const MyPlansPage = lazy(() => import('./features/coach/pages/MyPlansPage'));
const LoginPage = lazy(() => import('./pages/LoginPage'));
const AdminCoachApplicationsPage = lazy(() => import('./features/coach/pages/AdminCoachApplicationsPage'));
const TutorialPage = lazy(() => import('./pages/TutorialPage'));
const AdminTutorialPage = lazy(() => import('./pages/AdminTutorialPage'));
const ChatInboxPage = lazy(() => import('./pages/ChatInboxPage'));
const MetPeoplePage = lazy(() => import('./pages/MetPeoplePage'));
const FocusProfilePage = lazy(() => import('./pages/FocusProfilePage'));
const ChatThreadPage = lazy(() => import('./pages/ChatThreadPage'));
const CommunityPage = lazy(() => import('./pages/CommunityPage'));
const ChatSearchPage = lazy(() => import('./pages/ChatSearchPage'));
const FriendsPage = lazy(() => import('./pages/FriendsPage'));
const ProfileVerificationPage = lazy(() => import('./pages/ProfileVerificationPage'));
const AdminProfileVerificationsPage = lazy(() => import('./pages/AdminProfileVerificationsPage'));
const WorkoutSessionPage = lazy(() => import('./pages/WorkoutSessionPage'));
const ExerciseProgressPage = lazy(() => import('./pages/ExerciseProgressPage'));
const GameMapPage = lazy(() => import('./features/game/pages/GameMapPage'));
const EXPLORE_SECTION_ENABLED = false;

function App() {
  const location = useLocation();

  return (
    <AppErrorBoundary resetKey={location.pathname}>
      <AppShell>
        <Suspense fallback={<RouteLoadingSkeleton pathname={location.pathname} />}>
          <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route
            path="/explore"
            element={EXPLORE_SECTION_ENABLED ? <ExplorePage /> : <Navigate to="/agenda" replace />}
          />
          <Route path="/embed/cartelle" element={<ExploreFoldersEmbedPage />} />
          <Route path="/faq" element={<FaqPage />} />
          <Route path="/tutorial" element={<TutorialPage />} />
          <Route path="/events/:id" element={<EventDetailPage />} />
          <Route path="/events/:id/workout" element={<WorkoutSessionPage />} />
          <Route path="/dashboard/progress" element={<ExerciseProgressPage />} />
          <Route path="/create" element={<VerifiedProfileRoute><CreateEventPage /></VerifiedProfileRoute>} />
          <Route path="/agenda" element={<AgendaPage />} />
          <Route path="/notifications" element={<NotificationsPage />} />
          <Route path="/chat" element={<ChatInboxPage />} />
          <Route path="/chat/inbox" element={<Navigate to="/chat" replace />} />
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
          <Route path="/game" element={<GameMapPage />} />
          <Route path="/pricing" element={<PricingPage />} />
          <Route path="/convenzioni" element={<ConvenzioniPage />} />
          <Route path="/admin/convenzioni-generator" element={<ConvenzioneAgreementGeneratorPage />} />
          <Route path="/convenzioni/voucher/:voucherId" element={<ConvenzioneVoucherPage />} />
          <Route path="/account" element={<AccountPage />} />
          <Route path="/verify-profile" element={<ProfileVerificationPage />} />
          <Route path="/account/xp" element={<Navigate to="/account" replace />} />
          <Route path="/account/ai" element={<AccountAiPage />} />
          <Route path="/coach" element={<CoachPage />} />
          <Route path="/coach/:id" element={<CoachProfilePage />} />
          <Route path="/become-coach" element={<BecomeCoachApplyPage />} />
          <Route path="/dashboard/coach" element={<CoachDashboardPage />} />
          <Route path="/dashboard/plans" element={<MyPlansPage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/reset-password" element={<LoginPage resetPasswordMode />} />
          <Route path="/admin/coach-applications" element={<AdminCoachApplicationsPage />} />
          <Route path="/admin/convenzioni-applications" element={<AdminConvenzioniApplicationsPage />} />
          <Route path="/admin/verifiche" element={<AdminVerificationRoute><AdminProfileVerificationsPage /></AdminVerificationRoute>} />
          <Route path="/admin/tutorial" element={<AdminTutorialPage />} />
          <Route path="/coach/plan" element={<CoachPlanPage />} />
          <Route path="/coach/check-in" element={<CoachCheckInPage />} />
          <Route path="/profile/me" element={<Navigate to="/account" replace />} />
          <Route path="/profile/:id" element={<ProfilePage />} />
          <Route path="/404" element={<NotFoundPage />} />
          <Route path="*" element={<Navigate to="/404" replace />} />
          </Routes>
        </Suspense>
      </AppShell>
    </AppErrorBoundary>
  );
}

export default App;
