# Fight Picker App Architecture

```mermaid
flowchart TD
    A[User Browser / React Client] 
    B[Express API Server (Node.js)]
    C[Supabase (Database & Auth)]

    A -- HTTP (REST API) --> B
    B -- Supabase JS Client --> C
    A -- Direct (optional: Auth/Storage) --> C

    subgraph Frontend
      A
    end
    subgraph Backend
      B
    end
    subgraph Cloud
      C
    end

    %% Notes:
    %% - The React Client communicates with the Express API for most app logic (register, login, fight data, votes, etc.)
    %% - The Express API uses the Supabase JS client to interact with the database and authentication.
    %% - The React Client may also interact directly with Supabase for some features (e.g., auth, storage), if configured.
``` 