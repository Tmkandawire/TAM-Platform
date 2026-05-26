/**
 * @file router/index.jsx
 * @module router
 *
 * Application router — React Router v6 data router.
 *
 * Route access matrix:
 *
 *  /                    Public — no auth required
 *  /about               Public
 *  /services            Public
 *  /contact             Public
 *  /login               Public (redirect to dashboard if already active)
 *  /register            Public
 *
 *  /onboarding          Auth required, active NOT required (requireActive=false)
 *                       Pending users must be able to reach this page.
 *
 *  /pending             Auth required, active NOT required (requireActive=false)
 *                       Pending users waiting for admin approval land here.
 *
 *  /member/*            Auth required + status === "active" (requireActive=true)
 *                       Pending users are redirected to /pending.
 *
 *  /admin/*             Auth required + role === "admin"
 *
 *  Admin route map:
 *    /admin/dashboard              → DashboardPage
 *    /admin/members                → MembersPage (pending member list)
 *    /admin/members/:id            → MemberDetailPage (full profile + documents)
 *    /admin/documents              → DocumentsPage (full document queue)
 *    /admin/documents/:userId/:docId → DocumentDetailPage (single doc review)
 *    /admin/broadcast              → BroadcastPage (compose + send)
 */

import {
  createBrowserRouter,
  RouterProvider,
  Navigate,
} from "react-router-dom";
import { Suspense, lazy } from "react";
import PageLoader from "../components/common/PageLoader.jsx";

/* ── Layouts ─────────────────────────────────────────────────────────────── */
import PublicLayout from "../components/layout/PublicLayout.jsx";
import MemberLayout from "../components/layout/MemberLayout.jsx";
import AdminLayout from "../components/layout/AdminLayout.jsx";

/* ── Auth guard ──────────────────────────────────────────────────────────── */
import ProtectedRoute from "../components/common/ProtectedRoute.jsx";

/* ── Public pages ────────────────────────────────────────────────────────── */
const HomePage = lazy(() => import("../pages/public/HomePage.jsx"));
const AboutPage = lazy(() => import("../pages/public/AboutPage.jsx"));
const ServicesPage = lazy(() => import("../pages/public/ServicesPage.jsx"));
const ContactPage = lazy(() => import("../pages/public/ContactPage.jsx"));

/* ── Auth pages ──────────────────────────────────────────────────────────── */
const LoginPage = lazy(() => import("../pages/auth/LoginPage.jsx"));
const RegisterPage = lazy(() => import("../pages/auth/RegisterPage.jsx"));
const OnboardingPage = lazy(() => import("../pages/auth/OnboardingPage.jsx"));
const PendingPage = lazy(() => import("../pages/auth/PendingPage.jsx"));
const ForgotPasswordPage = lazy(
  () => import("../pages/auth/ForgotPasswordPage.jsx"),
);
const ResetPasswordPage = lazy(
  () => import("../pages/auth/ResetPasswordPage.jsx"),
);

/* ── Member pages ────────────────────────────────────────────────────────── */
const MemberDashboardPage = lazy(
  () => import("../pages/member/DashboardPage.jsx"),
);
const MemberProfilePage = lazy(() => import("../pages/member/ProfilePage.jsx"));
const MemberDocumentsPage = lazy(
  () => import("../pages/member/DocumentsPage.jsx"),
);
const MemberNotificationsPage = lazy(
  () => import("../pages/member/NotificationsPage.jsx"),
);
const MemberSettingsPage = lazy(
  () => import("../pages/member/SettingsPage.jsx"),
);

/* ── Admin pages ─────────────────────────────────────────────────────────── */
const AdminDashboardPage = lazy(
  () => import("../pages/admin/DashboardPage.jsx"),
);
const AdminMembersPage = lazy(() => import("../pages/admin/MembersPage.jsx"));
const AdminMemberDetailPage = lazy(
  () => import("../pages/admin/MemberDetailPage.jsx"),
);
const AdminDocumentsPage = lazy(
  () => import("../pages/admin/DocumentsPage.jsx"),
);
const AdminDocumentDetailPage = lazy(
  () => import("../pages/admin/DocumentDetailPage.jsx"),
);
const AdminBroadcastPage = lazy(
  () => import("../pages/admin/BroadcastPage.jsx"),
);
const AdminNotificationsPage = lazy(
  () => import("../pages/admin/AdminNotificationsPage.jsx"),
);
const AdminInboxPage = lazy(() => import("../pages/admin/AdminInboxPage.jsx"));
const AuditLogsPage = lazy(() => import("../pages/admin/AuditLogsPage.jsx"));

const BulkReviewPage = lazy(() => import("../pages/admin/BulkReviewPage.jsx"));

/* ── Shared suspense wrapper ─────────────────────────────────────────────── */
const withSuspense = (Page) => (
  <Suspense fallback={<PageLoader />}>
    <Page />
  </Suspense>
);

/* ── Router ──────────────────────────────────────────────────────────────── */
const router = createBrowserRouter([
  /* ── Public routes ─────────────────────────────────────────────────────── */
  {
    element: <PublicLayout />,
    children: [
      { path: "/", element: withSuspense(HomePage) },
      { path: "/about", element: withSuspense(AboutPage) },
      { path: "/services", element: withSuspense(ServicesPage) },
      { path: "/contact", element: withSuspense(ContactPage) },
    ],
  },

  /* ── Auth routes (no session required) ─────────────────────────────────── */
  { path: "/login", element: withSuspense(LoginPage) },
  { path: "/register", element: withSuspense(RegisterPage) },
  { path: "/forgot-password", element: withSuspense(ForgotPasswordPage) },
  { path: "/reset-password", element: withSuspense(ResetPasswordPage) },

  /* ── Onboarding — auth required, active status NOT required ─────────────── */
  {
    element: <ProtectedRoute requireActive={false} />,
    children: [
      { path: "/onboarding", element: withSuspense(OnboardingPage) },
      { path: "/pending", element: withSuspense(PendingPage) },
    ],
  },

  /* ── Member portal — auth required + status must be "active" ───────────── */
  {
    element: <ProtectedRoute requiredRole="member" requireActive={true} />,
    children: [
      {
        element: <MemberLayout />,
        children: [
          {
            path: "/member/dashboard",
            element: withSuspense(MemberDashboardPage),
          },
          {
            path: "/member/profile",
            element: withSuspense(MemberProfilePage),
          },
          {
            path: "/member/documents",
            element: withSuspense(MemberDocumentsPage),
          },
          {
            path: "/member/notifications",
            element: withSuspense(MemberNotificationsPage),
          },
          {
            path: "/member/settings",
            element: withSuspense(MemberSettingsPage),
          },
        ],
      },
    ],
  },

  /* ── Admin portal ───────────────────────────────────────────────────────── */
  {
    element: <ProtectedRoute requiredRole="admin" />,
    children: [
      {
        element: <AdminLayout />,
        children: [
          {
            path: "/admin/dashboard",
            element: withSuspense(AdminDashboardPage),
          },
          {
            path: "/admin/members",
            element: withSuspense(AdminMembersPage),
          },
          {
            path: "/admin/members/:id",
            element: withSuspense(AdminMemberDetailPage),
          },
          {
            path: "/admin/documents",
            element: withSuspense(AdminDocumentsPage),
          },
          {
            path: "/admin/documents/:userId/:docId",
            element: withSuspense(AdminDocumentDetailPage),
          },
          {
            path: "/admin/broadcast",
            element: withSuspense(AdminBroadcastPage),
          },
          {
            path: "/admin/notifications",
            element: withSuspense(AdminNotificationsPage),
          },
          {
            path: "/admin/inbox",
            element: withSuspense(AdminInboxPage),
          },
          { path: "/admin/audit-logs", element: withSuspense(AuditLogsPage) },
          { path: "/admin/bulk-review", element: withSuspense(BulkReviewPage) },
        ],
      },
    ],
  },

  /* ── Catch-all ──────────────────────────────────────────────────────────── */
  { path: "*", element: <Navigate to="/" replace /> },
]);

export default function AppRouter() {
  return <RouterProvider router={router} />;
}
