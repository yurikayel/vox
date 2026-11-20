/**
 * @file Consultas GraphQL Arweave (somente strings).
 */

/** Mapa nome → string de consulta GraphQL Arweave. @type {Record<string, string>} */
export const QUERIES = {
  communities: `query ListCommunities($after: String) {
    transactions(
      first: 30
      after: $after
      tags: [
        { name: "App-Name", values: ["vox-brasil"] }
        { name: "Type", values: ["community"] }
      ]
      sort: HEIGHT_DESC
    ) {
      pageInfo { hasNextPage }
      edges {
        cursor
        node {
          id
          owner { address }
          tags { name value }
          block { timestamp }
        }
      }
    }
  }`,
  topics: `query ListTopics($communityId: String!, $after: String) {
    transactions(
      first: 50
      after: $after
      tags: [
        { name: "App-Name", values: ["vox-brasil"] }
        { name: "Type", values: ["topic"] }
        { name: "Community-Id", values: [$communityId] }
      ]
      sort: HEIGHT_DESC
    ) {
      pageInfo { hasNextPage }
      edges {
        cursor
        node {
          id
          owner { address }
          tags { name value }
          block { timestamp }
        }
      }
    }
  }`,
  replies: `query ListReplies($topicId: String!) {
    transactions(
      first: 100
      tags: [
        { name: "App-Name", values: ["vox-brasil"] }
        { name: "Type", values: ["reply"] }
        { name: "Reply-To", values: [$topicId] }
      ]
      sort: HEIGHT_ASC
    ) {
      edges {
        node {
          id
          owner { address }
          tags { name value }
          block { timestamp }
        }
      }
    }
  }`,
  topicById: `query GetTopic($id: ID!) {
    transaction(id: $id) {
      id
      owner { address }
      tags { name value }
      block { timestamp }
    }
  }`,
  memberships: `query ListMemberships($address: String!) {
    transactions(
      first: 50
      owners: [$address]
      tags: [
        { name: "App-Name", values: ["vox-brasil"] }
        { name: "Type", values: ["membership"] }
      ]
      sort: HEIGHT_DESC
    ) {
      edges {
        node {
          id
          tags { name value }
          block { timestamp }
        }
      }
    }
  }`,
  modActions: `query ListModActions($communityId: String!) {
    transactions(
      first: 50
      tags: [
        { name: "App-Name", values: ["vox-brasil"] }
        { name: "Type", values: ["mod-action"] }
        { name: "Community-Id", values: [$communityId] }
      ]
      sort: HEIGHT_DESC
    ) {
      edges {
        node {
          id
          owner { address }
          tags { name value }
          block { timestamp }
        }
      }
    }
  }`,
  profileKeys: `query GetProfileKey($address: String!) {
    transactions(
      first: 10
      owners: [$address]
      tags: [
        { name: "App-Name", values: ["vox-brasil"] }
        { name: "Type", values: ["profile-key", "membership"] }
      ]
      sort: HEIGHT_DESC
    ) {
      edges {
        node {
          id
          tags { name value }
          block { timestamp }
        }
      }
    }
  }`,
  handlesBySlug: `query GetHandleBySlug($slug: String!) {
    transactions(
      first: 10
      tags: [
        { name: "App-Name", values: ["vox-brasil"] }
        { name: "Type", values: ["handle"] }
        { name: "Handle", values: [$slug] }
      ]
      sort: HEIGHT_DESC
    ) {
      edges {
        node {
          id
          owner { address }
          tags { name value }
          block { timestamp }
        }
      }
    }
  }`,
  handlesByAddress: `query GetHandleByAddress($address: String!) {
    transactions(
      first: 5
      owners: [$address]
      tags: [
        { name: "App-Name", values: ["vox-brasil"] }
        { name: "Type", values: ["handle"] }
      ]
      sort: HEIGHT_DESC
    ) {
      edges {
        node {
          id
          tags { name value }
          block { timestamp }
        }
      }
    }
  }`,

  profileCardByAddress: `query GetProfileCardByAddress($address: String!) {
    transactions(
      first: 5
      owners: [$address]
      tags: [
        { name: "App-Name", values: ["vox-brasil"] }
        { name: "Type", values: ["profile-card"] }
      ]
      sort: HEIGHT_DESC
    ) {
      edges {
        node {
          id
          owner { address }
          tags { name value }
          block { timestamp }
        }
      }
    }
  }`,
  profileCardByRoute: `query GetProfileCardByRoute($routeId: String!) {
    transactions(
      first: 5
      tags: [
        { name: "App-Name", values: ["vox-brasil"] }
        { name: "Type", values: ["profile-card"] }
        { name: "Route-Id", values: [$routeId] }
      ]
      sort: HEIGHT_DESC
    ) {
      edges {
        node {
          id
          owner { address }
          tags { name value }
          block { timestamp }
        }
      }
    }
  }`,
  topicsByOwners: `query ListTopicsByOwners($owners: [String!]!, $after: String) {
    transactions(
      first: 30
      after: $after
      owners: $owners
      tags: [
        { name: "App-Name", values: ["vox-brasil"] }
        { name: "Type", values: ["topic"] }
      ]
      sort: HEIGHT_DESC
    ) {
      pageInfo { hasNextPage }
      edges {
        cursor
        node {
          id
          owner { address }
          tags { name value }
          block { timestamp }
        }
      }
    }
  }`,
  recentTopics: `query ListRecentTopics($after: String) {
    transactions(
      first: 30
      after: $after
      tags: [
        { name: "App-Name", values: ["vox-brasil"] }
        { name: "Type", values: ["topic"] }
      ]
      sort: HEIGHT_DESC
    ) {
      pageInfo { hasNextPage }
      edges {
        cursor
        node {
          id
          owner { address }
          tags { name value }
          block { timestamp }
        }
      }
    }
  }`
};