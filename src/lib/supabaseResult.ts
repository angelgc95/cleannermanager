type SupabaseErrorLike = {
  message?: string;
};

type SupabaseResultLike<T> = {
  data?: T;
  error?: SupabaseErrorLike | null;
};

export function requireSupabaseSuccess<T>(result: SupabaseResultLike<T>, action: string): T {
  if (result.error) {
    throw new Error(`${action} failed: ${result.error.message || "Unknown Supabase error"}`);
  }

  return result.data as T;
}
