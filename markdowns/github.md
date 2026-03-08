# GitHub Push Execution Plan

## Objective
Safely push the local Brink project to `https://github.com/Pr4tyushMishra/Brink.git` while ensuring:
1. No sensitive credentials (database URIs, JWT secrets) are leaked.
2. Files that already exist in the remote repository are pushed to a separate branch to preserve version history parity.
3. New files created locally are pushed to the `main` branch.

---

## Phase 1: Credential Auditing & Safety Strategy
Before attempting to stage any files for Git, we will rigorously audit the codebase.

1.  **Environment Variable Isolation (.env):**
    *   Ensure all secrets (like `DATABASE_URL`, `JWT_SECRET`) are stored in a `.env` file.
    *   Verify that `.env` is explicitly declared in `.gitignore`.
    *   Create a `.env.example` file containing dummy/placeholder values (e.g., `DATABASE_URL="mongodb+srv://<username>:<password>@cluster.mongodb.net/brink"`) so future developers know what environment variables are required.

2.  **Hardcoded Credential Scan:**
    *   Run searches across the `src/` directory for common credential patterns (e.g., `mongodb+srv`, `secret`, `password`).
    *   If any hardcoded credentials are found within the source code, extract them, move them to the local `.env` file, and replace the hardcoded values with `process.env.VARIABLE_NAME` references.

3.  **Git Configuration Review:**
    *   Ensure the local Git repository is initialized (`git init`).
    *   Add the remote repository (`git remote add origin https://github.com/Pr4tyushMishra/Brink.git`).
    *   Fetch the remote state (`git fetch origin`) without modifying local files.

---

## Phase 2: Remote File Separation (The Branch)
We need to handle files that already exist in the remote repository separately.

1.  **Identify Remote Files:**
    *   List the files currently tracked on the remote `main` branch.
2.  **Create Temporary Tracking Branch:**
    *   Create and checkout a new branch: `git checkout -b update-existing-files`.
3.  **Stage Existing Files:**
    *   Selectively `git add` only the files from our local project that match the remote file list.
4.  **Commit and Push Branch:**
    *   Create a commit: `git commit -m "Update existing files"`.
    *   Push this branch to the remote: `git push -u origin update-existing-files`.

---

## Phase 3: Pushing New Files (The Main Branch)
Now we push the bulk of the new project (like the Fastify backend, real-time collaboration engine, and custom Landing Page).

1.  **Switch to Main:**
    *   Checkout the main branch: `git checkout main`.
2.  **Stage Remaining Untracked Files:**
    *   Stage everything else (which, due to Phase 2, will primarily be the new files): `git add .`.
    *   *Self-Correction Check: Ensure the `.gitignore` is actively preventing `.env` and `node_modules` from being staged during this broad command.*
3.  **Commit and Push Main:**
    *   Create a commit: `git commit -m "Initial push of Brink core engine and frontend"`.
    *   Push to the remote main branch: `git push -u origin main` (or using `--force-with-lease` if resolving minor unrelated history conflicts is necessary, though standard push is preferred).
