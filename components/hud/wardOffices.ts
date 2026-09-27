import { z } from "zod";
import { isOfficialUrl } from "@/lib/contract/officialSources";
import raw from "@/data/offices/mcgm-ward-water-offices.json";

/** One MCGM ward Water Works office, copied verbatim from that ward's official AEWW RTI manual. */
const wardOfficeSchema = z.strictObject({
  ward: z.string().min(1).max(20),
  office: z.string().min(3).max(160),
  address: z.string().min(10).max(300),
  hours: z.string().max(300).optional(),
  /** Date the Google Maps pin for this address was checked by eye; only these wards get an embedded map. */
  mapCheckedOn: z.iso.date().optional(),
  source: z.strictObject({
    url: z.url().refine((u) => isOfficialUrl(u), "source must be an official page"),
    title: z.string().min(3).max(200),
    retrievedOn: z.iso.date(),
  }),
});
export type WardOffice = z.infer<typeof wardOfficeSchema>;

const parsed = z.strictObject({ about: z.string(), offices: z.array(wardOfficeSchema) }).safeParse(raw);

/** Validated at import; an invalid file yields no offices rather than a broken page (PRD §13.1: zod at boundaries). */
export const WARD_OFFICES: readonly WardOffice[] = parsed.success ? parsed.data.offices : [];

/** Google Maps search for the verbatim address: the maps app locates it; we don't store or invent coordinates. */
export function mapsSearchUrl(address: string): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
}

/**
 * Google Maps embed for the verbatim address (no API key, no stored coordinates): Google places the pin
 * from the official address text. Needs internet; the page still works without it.
 */
export function mapsEmbedUrl(address: string): string {
  return `https://maps.google.com/maps?q=${encodeURIComponent(address)}&z=16&output=embed`;
}
