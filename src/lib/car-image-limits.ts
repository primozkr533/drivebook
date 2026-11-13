// Client-safe: shared by the car image service and the car form.
export const MAX_CAR_IMAGE_BYTES = 10 * 1024 * 1024;

export const isCarImageTooLarge = (file: { size: number } | null | undefined) =>
  (file?.size ?? 0) > MAX_CAR_IMAGE_BYTES;
