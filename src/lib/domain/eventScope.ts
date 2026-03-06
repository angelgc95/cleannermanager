/**
 * Event scope helpers.
 *
 * RULE: Any write tied to a cleaning event must use event.host_user_id,
 * not the derived hostId from the cleaner's first assignment.
 * This ensures correct scoping when a cleaner belongs to multiple hosts.
 */

/**
 * Returns the host_user_id that must be used for any insert/update
 * related to a cleaning event. Throws if the event has no host_user_id.
 */
export function getEventHostId(event: { host_user_id?: string | null } | null | undefined): string {
  const hostId = event?.host_user_id;
  if (!hostId) {
    throw new Error("Cannot determine host_user_id from event — event is null or missing host_user_id.");
  }
  return hostId;
}
