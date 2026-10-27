# Fenn Bot

<!-- impeccable:product-schema 1 -->

## Platform

web

Electron desktop application, initially developed and verified on Windows.

## Stack

Reuse suitable Electron, React and ACP building blocks from Fenn Code, with an independent source snapshot in this repository. Vanilla CSS and Fenn tokens. Independent local application, data directory, build and source tree; no sibling checkout is required.

## Users and purpose

A personal desktop assistant for ongoing conversations and practical work in a browser or explicitly permitted applications. Each Bot can use a different ACP backend. The user can inspect activity, grant or deny operations, and stop execution.

## Confirmed constraints

Published as an experimental MIT-licensed source snapshot, without an active development roadmap. Data stays on the user's machine. Prefer Playwright for browser work. Reuse suitable Fenn components and backend code rather than building a second adapter stack. Permissions apply to the tools provided by this host and to requests surfaced through ACP; they are not an operating-system sandbox around an arbitrary CLI.

## Reference

The installed Grok Bot was opened and visually inspected: persistent Bot list, compact conversation header, a focused message area and restrained action chrome. Its account, conversations and proprietary assets are not copied.

## Product principles

- Conversation stays central; activity and configuration are secondary disclosures.
- Report actual progress and results; no simulated replies in normal use.
- Explain what an operation can access and how long permission lasts.
- Stop withdraws host permissions and cancels the active turn.

## Open decisions

Packaged distribution, remote access, cloud synchronization and messaging integrations are not provided.
