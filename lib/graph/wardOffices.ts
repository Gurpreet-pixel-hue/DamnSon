import { z } from "zod";
import { isOfficialUrl } from "@/lib/contract/officialSources";
import raw from "@/data/offices/mcgm-ward-water-offices.json";

/**
 * One MCGM ward Water Works office. address and hours are copied verbatim from that ward's official
 * AEWW RTI Section 4 manual (PRD §13.1: never invent addresses or hours). See docs/adr/0002.
 */
export const wardOfficeSchema = z.strictObject({
  ward: z.string().min(1).max(20),
  office: z.string().min(3).max(160),
  address: z.string().min(10).max(300),
  hours: z.string().min(5).max(300).optional(),
  /** Date the Google Maps pin for this address was checked by eye; omitted where Google could not place it. */
  mapCheckedOn: z.iso.date().optional(),
  source: z.strictObject({
    url: z.url().refine((u) => isOfficialUrl(u), "source must be an official page"),
    title: z.string().min(3).max(200),
    retrievedOn: z.iso.date(),
  }),
});
export type WardOffice = z.infer<typeof wardOfficeSchema>;

export const wardOfficesFileSchema = z
  .strictObject({ about: z.string().min(10), offices: z.array(wardOfficeSchema).min(1) })
  .refine((f) => new Set(f.offices.map((o) => o.ward)).size === f.offices.length, "each ward appears once");

const parsed = wardOfficesFileSchema.safeParse(raw);

/** Validated at import; an invalid file yields no offices rather than a broken page (zod at boundaries). */
export const WARD_OFFICES: readonly WardOffice[] = parsed.success ? parsed.data.offices : [];

/** Google Maps search for the verbatim address: the maps app locates it; we store no coordinates. */
export function mapsSearchUrl(address: string): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
}
