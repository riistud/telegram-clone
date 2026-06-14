class Router {
  constructor() {
    this.routes = {};
    this.currentRoute = null;

    window.addEventListener('hashchange', () => this.handleRoute());
  }

  add(path, handler) {
    this.routes[path] = handler;
  }

  navigate(path) {
    window.location.hash = path;
  }

  handleRoute() {
    const hash = window.location.hash.slice(1) || '/login';
    
    // Check for parameterized routes
    let matched = false;
    for (const path in this.routes) {
      if (path.includes(':')) {
        const regex = new RegExp('^' + path.replace(/:[^/]+/g, '([^/]+)') + '$');
        const match = hash.match(regex);
        if (match) {
          this.currentRoute = path;
          this.routes[path](match[1]);
          matched = true;
          break;
        }
      } else if (hash === path) {
        this.currentRoute = path;
        this.routes[path]();
        matched = true;
        break;
      }
    }

    if (!matched) {
      this.navigate('/login');
    }
  }

  start() {
    this.handleRoute();
  }
}

const router = new Router();
