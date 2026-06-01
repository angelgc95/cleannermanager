import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App";

const mocks = vi.hoisted(() => ({
  authState: {
    session: null,
    user: null as { id: string; email?: string } | null,
    loading: false,
    role: null as "host" | "cleaner" | null,
    hostId: null,
    profileComplete: false,
    refreshProfile: vi.fn(),
  },
  signOut: vi.fn(),
}));

vi.mock("@/hooks/useAuth", async () => {
  const React = await vi.importActual<typeof import("react")>("react");
  return {
    AuthProvider: ({ children }: { children: ReactNode }) => React.createElement(React.Fragment, null, children),
    useAuth: () => mocks.authState,
  };
});

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: {
      signOut: mocks.signOut,
    },
  },
}));

describe("cleaner invite routing", () => {
  beforeEach(() => {
    mocks.authState.session = null;
    mocks.authState.user = null;
    mocks.authState.loading = false;
    mocks.authState.role = null;
    mocks.authState.hostId = null;
    mocks.authState.profileComplete = false;
    mocks.authState.refreshProfile.mockReset();
    mocks.signOut.mockReset();
    window.history.pushState({}, "", "/");
  });

  it("does not expose host signup when a cleaner invite link is expired", async () => {
    window.history.pushState({}, "", "/complete-profile?error_code=otp_expired");

    render(<App />);

    expect(await screen.findByText("Cleaner invitation expired")).toBeInTheDocument();
    expect(screen.queryByText("Sign up as Host")).not.toBeInTheDocument();
    expect(screen.queryByText("Create Host Account")).not.toBeInTheDocument();
  });

  it("keeps signed-in non-cleaner accounts out of host onboarding from complete-profile", async () => {
    mocks.authState.user = { id: "host-user-id", email: "host@example.com" };
    window.history.pushState({}, "", "/complete-profile");

    render(<App />);

    expect(await screen.findByText("Cleaner setup only")).toBeInTheDocument();
    expect(screen.queryByText("Continue as Host")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /sign out and use the cleaner invite/i }));

    await waitFor(() => expect(mocks.signOut).toHaveBeenCalled());
    expect(window.location.pathname).toBe("/auth");
    expect(window.location.search).toBe("?cleaner=1");
  });

  it("hides host signup on cleaner-only auth links", async () => {
    window.history.pushState({}, "", "/auth?cleaner=1");

    render(<App />);

    expect(await screen.findByText("Sign in to your cleaner account")).toBeInTheDocument();
    expect(screen.queryByText("Sign up as Host")).not.toBeInTheDocument();
    expect(screen.queryByText("Create a new host account")).not.toBeInTheDocument();
  });
});
