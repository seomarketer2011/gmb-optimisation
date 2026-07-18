import { Button, Input, Label, Select, Textarea } from "@/components/ui";
import type { schema } from "@/db";

type Location = typeof schema.locations.$inferSelect;

export function LocationFields({ location }: { location?: Location }) {
  return (
    <div className="grid gap-3 md:grid-cols-2">
      <div>
        <Label htmlFor="name">Location name *</Label>
        <Input id="name" name="name" required defaultValue={location?.name} />
      </div>
      <div>
        <Label htmlFor="primaryCategory">Primary category</Label>
        <Input
          id="primaryCategory"
          name="primaryCategory"
          placeholder="e.g. Fire protection service"
          defaultValue={location?.primaryCategory ?? ""}
        />
      </div>
      <div className="md:col-span-2">
        <Label htmlFor="secondaryCategories">
          Secondary categories (comma-separated)
        </Label>
        <Input
          id="secondaryCategories"
          name="secondaryCategories"
          placeholder="e.g. Painter, Decorator"
          defaultValue={location?.secondaryCategories ?? ""}
        />
      </div>
      <div>
        <Label htmlFor="address">Address</Label>
        <Input
          id="address"
          name="address"
          defaultValue={location?.address ?? ""}
        />
      </div>
      <div>
        <Label htmlFor="city">City / town</Label>
        <Input id="city" name="city" defaultValue={location?.city ?? ""} />
      </div>
      <div>
        <Label htmlFor="postcode">Postcode</Label>
        <Input
          id="postcode"
          name="postcode"
          defaultValue={location?.postcode ?? ""}
        />
      </div>
      <div>
        <Label htmlFor="phone">Phone</Label>
        <Input id="phone" name="phone" defaultValue={location?.phone ?? ""} />
      </div>
      <div>
        <Label htmlFor="website">Website / landing page</Label>
        <Input
          id="website"
          name="website"
          placeholder="https://…"
          defaultValue={location?.website ?? ""}
        />
      </div>
      <div>
        <Label htmlFor="gbpUrl">GBP URL (Maps link)</Label>
        <Input
          id="gbpUrl"
          name="gbpUrl"
          placeholder="https://maps.google.com/…"
          defaultValue={location?.gbpUrl ?? ""}
        />
      </div>
      <div>
        <Label htmlFor="placeId">Google Place ID (pins protection checks)</Label>
        <Input
          id="placeId"
          name="placeId"
          placeholder="ChIJ…"
          defaultValue={location?.placeId ?? ""}
        />
      </div>
      <div>
        <Label htmlFor="serviceAreas">Service areas</Label>
        <Input
          id="serviceAreas"
          name="serviceAreas"
          placeholder="Croydon, Bromley, Sutton"
          defaultValue={location?.serviceAreas ?? ""}
        />
      </div>
      <div>
        <Label htmlFor="status">Status</Label>
        <Select
          id="status"
          name="status"
          defaultValue={location?.status ?? "active"}
        >
          <option value="active">Active</option>
          <option value="onboarding">Onboarding</option>
          <option value="paused">Paused</option>
          <option value="suspended">Suspended</option>
          <option value="archived">Archived</option>
        </Select>
      </div>
      <div className="md:col-span-2">
        <Label htmlFor="services">
          Services (one per line — used to prepare post content)
        </Label>
        <Textarea
          id="services"
          name="services"
          rows={4}
          placeholder={"Fire door installation\nFire door inspection\nFire door repair"}
          defaultValue={location?.services ?? ""}
        />
      </div>
      <div className="md:col-span-2">
        <Label htmlFor="description">Business description</Label>
        <Textarea
          id="description"
          name="description"
          rows={3}
          defaultValue={location?.description ?? ""}
        />
      </div>
      {location && (
        <div className="md:col-span-2">
          <Label htmlFor="notes">Internal notes</Label>
          <Textarea
            id="notes"
            name="notes"
            rows={2}
            defaultValue={location?.notes ?? ""}
          />
        </div>
      )}
    </div>
  );
}

export function SubmitRow({ label }: { label: string }) {
  return (
    <div className="mt-4">
      <Button type="submit">{label}</Button>
    </div>
  );
}
