function fileExtension(fileName: string) {
  const rawExtension = fileName.split(".").pop()?.toLowerCase().replace(/[^a-z0-9]/g, "");
  return rawExtension && rawExtension !== fileName.toLowerCase() ? rawExtension : "jpg";
}

export function buildMaintenancePhotoPath(userId: string, fileName: string, id = crypto.randomUUID()) {
  return `${userId}/maintenance/${id}.${fileExtension(fileName)}`;
}
