package main

import (
	"fmt"
	"log"
	"os"
	"strings"

	"github.com/spf13/pflag"
	"gutenacht.site/pulse"
	"gutenacht.site/pulse/agent"
	"gutenacht.site/pulse/agent/health"
)

// cli options
type cmdOptions struct {
	hubURL string // hubURL is the URL of the Pulse Hub.
	token  string // token is the token to use for authentication.
	code   string // code is a one-time pairing code.
}

// parse parses the command line flags and populates the config struct.
// It returns true if a subcommand was handled and the program should exit.
func (opts *cmdOptions) parse() bool {
	subcommand := ""
	if len(os.Args) > 1 {
		subcommand = os.Args[1]
	}

	// Subcommands that don't require any pflag parsing
	switch subcommand {
	case "health":
		err := health.Check()
		if err != nil {
			log.Fatal(err)
		}
		fmt.Print("ok")
		return true
	case "fingerprint":
		handleFingerprint()
		return true
	}

	// pflag.CommandLine.ParseErrorsWhitelist.UnknownFlags = true
	pflag.StringVarP(&opts.hubURL, "url", "u", "", "URL of the Pulse Hub")
	pflag.StringVarP(&opts.token, "token", "t", "", "Token to use for authentication")
	pflag.StringVar(&opts.code, "code", "", "One-time pairing code")
	chinaMirrors := pflag.BoolP("china-mirrors", "c", false, "Use configured mirror for update instead of GitHub")
	version := pflag.BoolP("version", "v", false, "Show version information")
	help := pflag.BoolP("help", "h", false, "Show this help message")

	// Convert old single-dash long flags to double-dash for backward compatibility
	flagsToConvert := []string{"url", "token"}
	for i, arg := range os.Args {
		for _, flag := range flagsToConvert {
			singleDash := "-" + flag
			doubleDash := "--" + flag
			if arg == singleDash {
				os.Args[i] = doubleDash
				break
			} else if strings.HasPrefix(arg, singleDash+"=") {
				os.Args[i] = doubleDash + arg[len(singleDash):]
				break
			}
		}
	}

	pflag.Usage = func() {
		builder := strings.Builder{}
		builder.WriteString("Usage: ")
		builder.WriteString(os.Args[0])
		builder.WriteString(" [command] [flags]\n")
		builder.WriteString("\nCommands:\n")
		builder.WriteString("  fingerprint  View or reset the agent fingerprint\n")
		builder.WriteString("  health       Check if the agent is running\n")
		builder.WriteString("  pair         Pair this agent with the hub using a one-time code\n")
		builder.WriteString("  update       Update to the latest version\n")
		builder.WriteString("\nFlags:\n")
		fmt.Print(builder.String())
		pflag.PrintDefaults()
	}

	// Parse all arguments with pflag
	pflag.Parse()

	// Must run after pflag.Parse()
	switch {
	case *version:
		fmt.Println(pulse.AppName+"-agent", pulse.Version)
		return true
	case *help || subcommand == "help":
		pflag.Usage()
		return true
	case subcommand == "update":
		agent.Update(*chinaMirrors)
		return true
	case subcommand == "pair":
		if err := opts.handlePair(); err != nil {
			log.Fatal(err)
		}
		return true
	}

	// Set environment variables from CLI flags (if provided)
	if opts.hubURL != "" {
		os.Setenv("HUB_URL", opts.hubURL)
	}
	if opts.token != "" {
		os.Setenv("TOKEN", opts.token)
	}
	return false
}

func (opts *cmdOptions) handlePair() error {
	if opts.hubURL == "" {
		return fmt.Errorf("missing hub url: use --url")
	}
	if opts.code == "" {
		return fmt.Errorf("missing pairing code: use --code")
	}
	dataDir, err := agent.GetDataDir()
	if err != nil {
		return err
	}
	credentials, err := agent.PairAgent(opts.hubURL, opts.code, dataDir, "")
	if err != nil {
		return err
	}
	if err := agent.SavePairingCredentials(dataDir, credentials); err != nil {
		return err
	}
	fmt.Printf("Pairing complete. Agent ID: %s\nCredentials saved to: %s\n", credentials.AgentID, dataDir)
	return nil
}

// handleFingerprint handles the "fingerprint" command with subcommands "view" and "reset".
func handleFingerprint() {
	subCmd := ""
	if len(os.Args) > 2 {
		subCmd = os.Args[2]
	}

	switch subCmd {
	case "", "view":
		dataDir, _ := agent.GetDataDir()
		fp := agent.GetFingerprint(dataDir, "", "")
		fmt.Println(fp)
	case "help", "-h", "--help":
		fmt.Print(fingerprintUsage())
	case "reset":
		dataDir, err := agent.GetDataDir()
		if err != nil {
			log.Fatal(err)
		}
		if err := agent.DeleteFingerprint(dataDir); err != nil {
			log.Fatal(err)
		}
		fmt.Println("Fingerprint reset. A new one will be generated on next start.")
	default:
		log.Fatalf("Unknown command: %q\n\n%s", subCmd, fingerprintUsage())
	}
}

func fingerprintUsage() string {
	return fmt.Sprintf("Usage: %s fingerprint [view|reset]\n\nCommands:\n  view   Print fingerprint (default)\n  reset  Reset saved fingerprint\n", os.Args[0])
}

func main() {
	var opts cmdOptions
	subcommandHandled := opts.parse()

	if subcommandHandled {
		return
	}

	a, err := agent.NewAgent()
	if err != nil {
		log.Fatal("Failed to create agent: ", err)
	}

	if err := a.Start(); err != nil {
		log.Fatal("Failed to start: ", err)
	}
}
