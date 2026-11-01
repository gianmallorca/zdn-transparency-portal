# Citizen reports: the link contract

Reports about a project ("not started", "finished", "can't find it", a photo) will be
collected by **one** service on budget.bettergov.ph for every portal. Portals do not take
reports themselves. One service means one place to moderate, one spam defence, one
privacy policy, and one dataset that covers every portal.

The service is not built yet. This is the contract portals already follow, so it can be
switched on without changing any portal's code beyond its config.

## The link

A portal sends the reader to the central form:

```text
GET {reporting.url}?portal={id}&dataset={dataset}&project={project id}&from={page URL}
```

| Parameter | Value |
| --- | --- |
| `portal` | `config.id` of the portal the reader came from, e.g. `zamboanga-del-norte` |
| `dataset` | `dpwh`, `fmr`, `hfep` or `nia` |
| `project` | The project id as the API gives it, e.g. `house-reading:848` |
| `from` | The page the reader was on, for a "back to the portal" link |

`reporting.url` defaults to `https://budget.bettergov.ph/report`. Built in
`src/lib/report.ts` (`reportHref`).

## What the central service should do

- Look the project up in the API by `dataset` and `project`. Never trust a title or
  amount passed in a URL; a portal cannot change what is being reported on.
- Record `portal` so reports can be counted per portal, and so a portal could later show
  "N reports about this project".
- Treat `from` as a return link only, after checking it is an http(s) URL.

## Switching it on

When the service is live, a portal sets:

```ts
reporting: { enabled: true },
```

The project page then shows "Report on this project". Until then it says that reports
will go to budget.bettergov.ph and that reporting is not open yet.

## Not decided yet

- Whether portals can read reports back (an API route such as
  `/api/v1/reports?portal=…&project=…`) to show counts.
- Report types, photo handling, and whether a reporter can leave contact details.
