//go:build testing

package hub_test

import (
	"testing"

	"github.com/pocketbase/pocketbase/core"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	pulseTests "gutenacht.site/pulse/internal/tests"
)

func TestNetworkTopologyLayoutsCollection(t *testing.T) {
	hub, err := pulseTests.NewTestHub(t.TempDir())
	require.NoError(t, err)
	defer hub.Cleanup()

	collection, err := hub.FindCollectionByNameOrId("network_topology_layouts")
	require.NoError(t, err)
	require.NotNil(t, collection.ListRule)
	assert.Equal(t, `@request.auth.id != "" && user = @request.auth.id`, *collection.ListRule)
	require.NotNil(t, collection.CreateRule)
	assert.Equal(t, `@request.auth.id != "" && user = @request.auth.id && @request.auth.role != "readonly"`, *collection.CreateRule)

	userField, ok := collection.Fields.GetByName("user").(*core.RelationField)
	require.True(t, ok)
	assert.Equal(t, "_pb_users_auth_", userField.CollectionId)
	assert.True(t, userField.CascadeDelete)

	nodesField, ok := collection.Fields.GetByName("nodes").(*core.JSONField)
	require.True(t, ok)
	assert.GreaterOrEqual(t, nodesField.MaxSize, int64(2000000))
}
