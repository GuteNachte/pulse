//go:build testing

package alerts

func SetShoutrrrSenderForTest(sender func(string, string) error) func() {
	previousSender := sendShoutrrr
	sendShoutrrr = sender
	return func() {
		sendShoutrrr = previousSender
	}
}
