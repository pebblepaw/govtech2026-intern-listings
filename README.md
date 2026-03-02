# GovTech 2026 Intern Listings

A lightweight, fast, client-side static web application to browse GovTech's 2026 internship roles without suffering through a messy Excel spreadsheet.

## Live Site
[https://pebblepaw.github.io/govtech2026-intern-listings/](https://pebblepaw.github.io/govtech2026-intern-listings/)

## Features
- **Updated daily (automated):** Pulls from https://go.gov.sg/govtechinternshipprojects2026 nightly at **9pm SGT** via GitHub Actions.
- **Fast search:** Keyword search across title/description/prereqs/outcomes.
- **Multi-select filters (dynamic):** Category (sheet), Division, Level, Duration — options grey out when irrelevant.
- **Favourites:** Star jobs (★) stored locally in your browser (`localStorage`).
- **Compare (latest 3):** Pick jobs to compare; selecting a 4th drops the oldest so you always compare the latest 3.
- **Comfortable reading:** Detail view with scroll for long content.
- **Zero tracking:** Static HTML/JS, no analytics.

*Last updated: 3 Mar 2026*