/**
 * @file router/index.jsx
 * @module router
 *
 * Application router — React Router v6 data router.
 *
 * Route structure:
 *
 *   /                     PublicLayout
 *   /about                PublicLayout
 *   /services             PublicLayout
 *   /contact              PublicLayout
 *   /login                standalone
 *   /register             standalone
 *   /member/*             ProtectedRoute (role: member) → MemberLayout
 *     /member/dashboard
 *     /member/profile
 *     /member/documents
 *     /member/notifications
 *     /member/settings
 *   * → /
 *
 * Auth guards:
 *  - ProtectedRoute checks isHydrated before rendering to prevent
 *    flash-redirects on page reload.
 *  - requiredRole="member" redirects admins to /admin/dashboard
 *    and unauthenticated users to /login with `from` state preserved.
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

/* ── Shared suspense wrapper ─────────────────────────────────────────────── */
const withSuspense = (Page) => (
  <Suspense fallback={<PageLoader />}>
    <Page />
  </Suspense>
);

/* ── Router ──────────────────────────────────────────────────────────────── */
const router = createBrowserRouter([
  /* ── Public routes — Navbar + Footer via PublicLayout ─────────────────── */
  {
    element: <PublicLayout />,
    children: [
      { path: "/", element: withSuspense(HomePage) },
      { path: "/about", element: withSuspense(AboutPage) },
      { path: "/services", element: withSuspense(ServicesPage) },
      { path: "/contact", element: withSuspense(ContactPage) },
    ],
  },

  /* ── Auth routes — standalone, no Navbar/Footer ────────────────────────── */
  { path: "/login", element: withSuspense(LoginPage) },
  { path: "/register", element: withSuspense(RegisterPage) },

  /* ── Member portal — auth-gated, role: member ──────────────────────────── */
  {
    element: (
      <ProtectedRoute requiredRole="member">
        <MemberLayout />
      </ProtectedRoute>
    ),
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

  /* ── Catch-all ──────────────────────────────────────────────────────────── */
  { path: "*", element: <Navigate to="/" replace /> },
]);

export default function AppRouter() {
  return <RouterProvider router={router} />;
}
