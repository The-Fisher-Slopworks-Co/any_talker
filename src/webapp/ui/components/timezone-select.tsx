import { useI18n } from "../i18n-context";
import {
  getTimezoneAreas,
  getTimezoneLocations,
  splitTimezone,
} from "../timezones";
import { Card } from "./layout";
import { SelectChevron } from "./controls";
import { INPUT_CLS, ROW_CLS, ROW_LABEL_CLS } from "./row";

export function TimezoneSelect({
  value,
  onChange,
}: {
  value: string;
  onChange: (tz: string) => void;
}) {
  const { t: s } = useI18n();
  const areas = getTimezoneAreas();
  const { area, location } = splitTimezone(value);
  const locations = getTimezoneLocations(area);

  const areaOptions = areas.includes(area) ? areas : [area, ...areas];
  const locationOptions =
    location && !locations.includes(location)
      ? [location, ...locations]
      : locations;

  const onAreaChange = (next: string) => {
    const list = getTimezoneLocations(next);
    if (list.length > 0) onChange(`${next}/${list[0]}`);
  };

  const onLocationChange = (next: string) => {
    onChange(`${area}/${next}`);
  };

  return (
    <Card>
      <label className={ROW_CLS}>
        <span className={ROW_LABEL_CLS}>{s.ui_tz_area}</span>
        <span className="relative flex flex-1 min-w-0 items-center">
          <select
            className={`${INPUT_CLS} w-full pr-5`}
            value={area}
            onChange={(e) => onAreaChange(e.target.value)}
          >
            {areaOptions.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
          <SelectChevron />
        </span>
      </label>
      <label className={ROW_CLS}>
        <span className={ROW_LABEL_CLS}>{s.ui_tz_location}</span>
        <span className="relative flex flex-1 min-w-0 items-center">
          <select
            className={`${INPUT_CLS} w-full pr-5`}
            value={location}
            onChange={(e) => onLocationChange(e.target.value)}
            disabled={locationOptions.length === 0}
          >
            {locationOptions.map((l) => (
              <option key={l} value={l}>
                {l.replace(/_/g, " ")}
              </option>
            ))}
          </select>
          <SelectChevron />
        </span>
      </label>
    </Card>
  );
}
