//go:build !development

package hub

import (
	"io/fs"
	"net/http"
	"strings"

	"gutenacht.site/pulse/internal/hub/utils"
	"gutenacht.site/pulse/internal/site"

	"github.com/pocketbase/pocketbase/apis"
	"github.com/pocketbase/pocketbase/core"
)

// startServer sets up the production server for Pulse
func (h *Hub) startServer(se *core.ServeEvent) error {
	indexFile, _ := fs.ReadFile(site.DistDirFS, "index.html")
	html := modifyIndexHTML(h, indexFile)
	// set up static asset serving
	serveStatic := apis.Static(site.DistDirFS, false)
	// get CSP configuration
	csp, cspExists := utils.GetEnv("CSP")
	// add route
	se.Router.GET("/{path...}", func(e *core.RequestEvent) error {
		if embeddedStaticFileExists(e.Request.URL.Path) {
			e.Response.Header().Set("Cache-Control", staticCacheControl(e.Request.URL.Path))
			return serveStatic(e)
		}
		if cspExists {
			e.Response.Header().Del("X-Frame-Options")
			e.Response.Header().Set("Content-Security-Policy", csp)
		}
		return e.HTML(http.StatusOK, html)
	})
	return nil
}

func embeddedStaticFileExists(path string) bool {
	name := strings.TrimPrefix(path, "/")
	if name == "" {
		return false
	}
	info, err := fs.Stat(site.DistDirFS, name)
	return err == nil && !info.IsDir()
}

func staticCacheControl(path string) string {
	if strings.TrimPrefix(path, "/") == "sw.js" {
		return "no-cache"
	}
	return "public, max-age=2592000"
}

func isDevelopmentBuild() bool {
	return false
}
