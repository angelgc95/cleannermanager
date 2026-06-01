import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AdminCleanerManagement } from "./AdminCleanerManagement";

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  invoke: vi.fn(),
  toast: vi.fn(),
  t: (value: string) => value,
  user: { id: "host-user-id" },
}));

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({ user: mocks.user }),
}));

vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: mocks.toast }),
}));

vi.mock("@/i18n/LanguageProvider", () => ({
  useI18n: () => ({ t: mocks.t }),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    functions: { invoke: mocks.invoke },
    from: mocks.from,
  },
}));

type CleanerConnection = {
  cleaner_user_id: string;
  invited_email: string;
  status: "INVITED" | "ACTIVE";
};

type CleanerProfile = {
  user_id: string;
  name: string;
  email: string;
  setup_completed: boolean;
};

function result(data: unknown, error: Error | null = null) {
  return Promise.resolve({ data, error });
}

function installFetchMocks({
  connections = [],
  profiles = [],
  listingError = null,
}: {
  connections?: CleanerConnection[];
  profiles?: CleanerProfile[];
  listingError?: Error | null;
} = {}) {
  mocks.from.mockImplementation((table: string) => {
    if (table === "listings") {
      return {
        select: () => ({
          eq: () => ({
            order: () => result([], listingError),
          }),
        }),
      };
    }

    if (table === "host_cleaners") {
      return {
        select: () => ({
          eq: () => ({
            order: () => result(connections),
          }),
        }),
      };
    }

    if (table === "cleaner_assignments") {
      return {
        select: () => ({
          eq: () => result([]),
        }),
        insert: () => result(null),
        delete: () => ({
          eq: () => ({
            eq: () => result(null),
          }),
        }),
      };
    }

    if (table === "profiles") {
      return {
        select: () => ({
          in: () => result(profiles),
        }),
      };
    }

    throw new Error(`Unexpected table ${table}`);
  });
}

describe("AdminCleanerManagement", () => {
  beforeEach(() => {
    mocks.from.mockReset();
    mocks.invoke.mockReset();
    mocks.toast.mockReset();
    installFetchMocks();
  });

  it("sends normalized cleaner invites with the complete-profile redirect", async () => {
    mocks.invoke.mockResolvedValue({ data: { success: true, invited: true }, error: null });

    render(<AdminCleanerManagement />);

    await screen.findByText("No cleaners added yet.");
    fireEvent.change(screen.getByPlaceholderText("Invite cleaner by email"), {
      target: { value: " Cleaner@Example.com " },
    });
    fireEvent.click(screen.getByRole("button", { name: /invite/i }));

    await waitFor(() => expect(mocks.invoke).toHaveBeenCalledWith("onboard-user", expect.any(Object)));
    const [, request] = mocks.invoke.mock.calls[0];

    expect(request.body).toMatchObject({
      type: "invite_cleaner",
      cleaner_email: "cleaner@example.com",
    });
    expect(request.body.redirect_to).toBe(`${window.location.origin}/complete-profile`);
    expect(mocks.toast).toHaveBeenCalledWith(expect.objectContaining({ title: "Invitation sent" }));
  });

  it("resends setup email for invited cleaners", async () => {
    installFetchMocks({
      connections: [{ cleaner_user_id: "cleaner-user-id", invited_email: "pending@example.com", status: "INVITED" }],
      profiles: [{ user_id: "cleaner-user-id", name: "", email: "pending@example.com", setup_completed: false }],
    });
    mocks.invoke.mockResolvedValue({ data: { success: true, invited: true, reinvited: true }, error: null });

    render(<AdminCleanerManagement />);

    fireEvent.click(await screen.findByRole("button", { name: /resend/i }));

    await waitFor(() => expect(mocks.invoke).toHaveBeenCalledWith("onboard-user", expect.any(Object)));
    const [, request] = mocks.invoke.mock.calls[0];

    expect(request.body).toMatchObject({
      type: "invite_cleaner",
      cleaner_email: "pending@example.com",
    });
    expect(mocks.toast).toHaveBeenCalledWith(expect.objectContaining({ title: "Invitation resent" }));
  });

  it("surfaces cleaner list load failures", async () => {
    installFetchMocks({ listingError: new Error("database unavailable") });

    render(<AdminCleanerManagement />);

    await waitFor(() =>
      expect(mocks.toast).toHaveBeenCalledWith(
        expect.objectContaining({
          title: "Unable to load cleaners",
          description: "database unavailable",
          variant: "destructive",
        }),
      ),
    );
  });
});
