# Publishing only Sidelore source

The repository root must be the Sidelore project directory. Do not initialize or
stage a parent directory. The audit derives the root from its own location and
requires independent Git metadata inside that directory.

## Included source

- Application, package, and verification-script source.
- English documentation and research proposals; localized UI resources and
  language tests retain the languages they implement.
- Schemas, dependency manifests, lockfile, and reviewed deployment examples.
- The web manifest and service worker, copied through an explicit asset list.

## Excluded local content

Datasets and demo record files, research results, attachments, screenshots,
verification reports, node databases, identities, vaults, credentials, browser
profiles, environment files, SSH/certificate keys, backups, raw runs, logs,
caches, dependencies, compiled output, and installers are excluded.

Symlinks, hard-linked files, Git submodules, and borrowed Git object stores are
not permitted in this initial publication scope. Validation creates synthetic
input in memory; the source release needs no stored data or identity files.

## Inspect the actual snapshot

```sh
npm run test:source
npm run audit:source
npm run audit:source -- --history
git diff --cached --check
git diff --cached --stat
git diff --cached --name-only
```

The audit reads staged Git blobs, so cleaning a working file requires staging it
again. It checks the allowed paths and file types, recognizable credentials,
private paths, current machine identifiers, and language placement. It reports
filenames and reasons without printing matched sensitive values. These checks
support manual review; they do not prove that every possible secret is absent.

## Pseudonymous commit metadata

For this initial publication, use the project-local author and committer identity
`3072 <3072@users.invalid>`. The `.invalid` address is an intentionally unusable
placeholder, not a real mailbox or a GitHub-provided account email. Project
metadata also uses `3072`. No machine-wide identity settings need to be changed.

Disable inherited commit signing for this repository so an unrelated signing
identity is not attached. Inspect both the author and committer of every commit
being pushed; changing Git configuration cannot clean earlier commits. Use UTC
for initial publication metadata, and include no co-author/sign-off trailers or
machine information in the message.

A pseudonym does not make the GitHub account or repository ownership anonymous.
The hosting provider can still associate authenticated pushes with an account.
Reference: [GitHub commit email documentation](https://docs.github.com/en/account-and-profile/how-tos/email-preferences/setting-your-commit-email-address).

## Push scope

Publish only the reviewed initial source history to an explicitly selected
repository. Do not mirror other refs, branches, tags, or local histories.
Installers and generated reports require a separate release review and are not
part of the source commit. Git uploads referenced commit objects; untracked
files and local Git configuration are not included in a normal branch push.
