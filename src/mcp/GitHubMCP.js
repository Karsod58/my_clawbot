import axios from 'axios';
import { logger } from '../utils/logger.js';

export class GitHubMCP {
  constructor() {
    this.token = process.env.GITHUB_TOKEN;
    this.baseURL = 'https://api.github.com';
    this.client = null;
    this.rateLimitRemaining = 5000;
    this.rateLimitReset = null;
  }

  async initialize() {
    if (!this.token) {
      throw new Error('GITHUB_TOKEN not provided');
    }

    this.client = axios.create({
      baseURL: this.baseURL,
      headers: {
        'Authorization': `token ${this.token}`,
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'MiniBot-AI/1.0'
      }
    });

    // Add response interceptor to track rate limits
    this.client.interceptors.response.use(
      (response) => {
        this.rateLimitRemaining = parseInt(response.headers['x-ratelimit-remaining']) || 0;
        this.rateLimitReset = parseInt(response.headers['x-ratelimit-reset']) || 0;
        return response;
      },
      (error) => {
        if (error.response) {
          this.rateLimitRemaining = parseInt(error.response.headers['x-ratelimit-remaining']) || 0;
          this.rateLimitReset = parseInt(error.response.headers['x-ratelimit-reset']) || 0;
        }
        return Promise.reject(error);
      }
    );

    // Test the connection
    try {
      await this.client.get('/user');
      logger.info('GitHub MCP initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize GitHub MCP - check your token:', error.message);
      throw error;
    }
  }

  async executeOperation(operation, parameters, userId) {
    if (this.rateLimitRemaining < 10) {
      throw new Error('GitHub API rate limit nearly exceeded. Please try again later.');
    }

    switch (operation) {
      case 'list_repositories':
        return await this.listRepositories(parameters);
      
      case 'get_repository':
        return await this.getRepository(parameters);
      
      case 'list_issues':
        return await this.listIssues(parameters);
      
      case 'create_issue':
        return await this.createIssue(parameters);
      
      case 'get_file_content':
        return await this.getFileContent(parameters);
      
      case 'list_commits':
        return await this.listCommits(parameters);
      
      case 'get_pull_requests':
        return await this.getPullRequests(parameters);
      
      case 'search_repositories':
        return await this.searchRepositories(parameters);
      
      case 'get_user_info':
        return await this.getUserInfo(parameters);
      
      default:
        throw new Error(`Unknown GitHub operation: ${operation}`);
    }
  }

  async listRepositories(params = {}) {
    try {
      const { owner, type = 'all', sort = 'updated', per_page = 30 } = params;
      
      let url = owner ? `/users/${owner}/repos` : '/user/repos';
      
      const response = await this.client.get(url, {
        params: { type, sort, per_page }
      });

      return {
        repositories: response.data.map(repo => ({
          id: repo.id,
          name: repo.name,
          full_name: repo.full_name,
          description: repo.description,
          private: repo.private,
          html_url: repo.html_url,
          clone_url: repo.clone_url,
          language: repo.language,
          stars: repo.stargazers_count,
          forks: repo.forks_count,
          updated_at: repo.updated_at,
          created_at: repo.created_at
        })),
        total_count: response.data.length
      };
    } catch (error) {
      logger.error('Error listing repositories:', error);
      throw new Error(`Failed to list repositories: ${error.message}`);
    }
  }

  async getRepository(params) {
    try {
      const { owner, repo } = params;
      
      if (!owner || !repo) {
        throw new Error('Owner and repo parameters are required');
      }

      const response = await this.client.get(`/repos/${owner}/${repo}`);
      const repoData = response.data;

      return {
        id: repoData.id,
        name: repoData.name,
        full_name: repoData.full_name,
        description: repoData.description,
        private: repoData.private,
        html_url: repoData.html_url,
        clone_url: repoData.clone_url,
        language: repoData.language,
        languages_url: repoData.languages_url,
        stars: repoData.stargazers_count,
        forks: repoData.forks_count,
        watchers: repoData.watchers_count,
        size: repoData.size,
        default_branch: repoData.default_branch,
        topics: repoData.topics,
        license: repoData.license ? repoData.license.name : null,
        created_at: repoData.created_at,
        updated_at: repoData.updated_at,
        pushed_at: repoData.pushed_at
      };
    } catch (error) {
      logger.error('Error getting repository:', error);
      throw new Error(`Failed to get repository: ${error.message}`);
    }
  }

  async listIssues(params) {
    try {
      const { owner, repo, state = 'open', labels, sort = 'updated', per_page = 30 } = params;
      
      if (!owner || !repo) {
        throw new Error('Owner and repo parameters are required');
      }

      const queryParams = { state, sort, per_page };
      if (labels) queryParams.labels = labels;

      const response = await this.client.get(`/repos/${owner}/${repo}/issues`, {
        params: queryParams
      });

      return {
        issues: response.data.map(issue => ({
          id: issue.id,
          number: issue.number,
          title: issue.title,
          body: issue.body,
          state: issue.state,
          user: issue.user.login,
          labels: issue.labels.map(label => label.name),
          assignees: issue.assignees.map(assignee => assignee.login),
          html_url: issue.html_url,
          created_at: issue.created_at,
          updated_at: issue.updated_at,
          closed_at: issue.closed_at
        })),
        total_count: response.data.length
      };
    } catch (error) {
      logger.error('Error listing issues:', error);
      throw new Error(`Failed to list issues: ${error.message}`);
    }
  }

  async createIssue(params) {
    try {
      let { owner, repo, title, body, labels, assignees } = params;
      
      // If no owner provided but repo is provided, try to get current user as owner
      if (!owner && repo) {
        try {
          const userInfo = await this.getUserInfo();
          owner = userInfo.login;
          logger.info(`Using current user as owner: ${owner}`);
        } catch (error) {
          logger.warn('Could not get current user info for owner');
        }
      }
      
      if (!owner || !repo || !title) {
        throw new Error('Owner, repo, and title parameters are required');
      }

      const issueData = { title };
      if (body) issueData.body = body;
      if (labels) issueData.labels = labels;
      if (assignees) issueData.assignees = assignees;

      const response = await this.client.post(`/repos/${owner}/${repo}/issues`, issueData);
      const issue = response.data;

      return {
        id: issue.id,
        number: issue.number,
        title: issue.title,
        body: issue.body,
        state: issue.state,
        html_url: issue.html_url,
        created_at: issue.created_at
      };
    } catch (error) {
      logger.error('Error creating issue:', error);
      
      if (error.message.includes('410')) {
        throw new Error(`Cannot create issue: Repository issues may be disabled, or the GitHub token lacks write permissions. Please check: 1) Repository has issues enabled, 2) Token has 'repo' or 'public_repo' scope, 3) Token has 'write:issues' permission.`);
      } else if (error.message.includes('403')) {
        throw new Error(`Permission denied: GitHub token lacks write permissions. Please ensure the token has 'repo' or 'public_repo' scope and 'write:issues' permission.`);
      } else if (error.message.includes('422')) {
        throw new Error(`Invalid request: ${error.response?.data?.message || 'Check if all required fields are provided'}`);
      }
      
      throw new Error(`Failed to create issue: ${error.message}`);
    }
  }

  async getFileContent(params) {
    try {
      const { owner, repo, path, ref = 'main' } = params;
      
      if (!owner || !repo || !path) {
        throw new Error('Owner, repo, and path parameters are required');
      }

      const response = await this.client.get(`/repos/${owner}/${repo}/contents/${path}`, {
        params: { ref }
      });

      const file = response.data;
      
      if (file.type !== 'file') {
        throw new Error('Path does not point to a file');
      }

      return {
        name: file.name,
        path: file.path,
        size: file.size,
        content: Buffer.from(file.content, 'base64').toString('utf-8'),
        encoding: file.encoding,
        sha: file.sha,
        html_url: file.html_url,
        download_url: file.download_url
      };
    } catch (error) {
      logger.error('Error getting file content:', error);
      throw new Error(`Failed to get file content: ${error.message}`);
    }
  }

  async listCommits(params) {
    try {
      const { owner, repo, sha, path, author, since, until, per_page = 30 } = params;
      
      if (!owner || !repo) {
        throw new Error('Owner and repo parameters are required');
      }

      const queryParams = { per_page };
      if (sha) queryParams.sha = sha;
      if (path) queryParams.path = path;
      if (author) queryParams.author = author;
      if (since) queryParams.since = since;
      if (until) queryParams.until = until;

      const response = await this.client.get(`/repos/${owner}/${repo}/commits`, {
        params: queryParams
      });

      return {
        commits: response.data.map(commit => ({
          sha: commit.sha,
          message: commit.commit.message,
          author: {
            name: commit.commit.author.name,
            email: commit.commit.author.email,
            date: commit.commit.author.date
          },
          committer: {
            name: commit.commit.committer.name,
            email: commit.commit.committer.email,
            date: commit.commit.committer.date
          },
          html_url: commit.html_url,
          stats: commit.stats
        })),
        total_count: response.data.length
      };
    } catch (error) {
      logger.error('Error listing commits:', error);
      throw new Error(`Failed to list commits: ${error.message}`);
    }
  }

  async getPullRequests(params) {
    try {
      const { owner, repo, state = 'open', sort = 'updated', per_page = 30 } = params;
      
      if (!owner || !repo) {
        throw new Error('Owner and repo parameters are required');
      }

      const response = await this.client.get(`/repos/${owner}/${repo}/pulls`, {
        params: { state, sort, per_page }
      });

      return {
        pull_requests: response.data.map(pr => ({
          id: pr.id,
          number: pr.number,
          title: pr.title,
          body: pr.body,
          state: pr.state,
          user: pr.user.login,
          head: {
            ref: pr.head.ref,
            sha: pr.head.sha
          },
          base: {
            ref: pr.base.ref,
            sha: pr.base.sha
          },
          html_url: pr.html_url,
          created_at: pr.created_at,
          updated_at: pr.updated_at,
          merged_at: pr.merged_at
        })),
        total_count: response.data.length
      };
    } catch (error) {
      logger.error('Error getting pull requests:', error);
      throw new Error(`Failed to get pull requests: ${error.message}`);
    }
  }

  async searchRepositories(params) {
    try {
      const { query, sort = 'stars', order = 'desc', per_page = 30 } = params;
      
      if (!query) {
        throw new Error('Query parameter is required');
      }

      const response = await this.client.get('/search/repositories', {
        params: { q: query, sort, order, per_page }
      });

      return {
        repositories: response.data.items.map(repo => ({
          id: repo.id,
          name: repo.name,
          full_name: repo.full_name,
          description: repo.description,
          html_url: repo.html_url,
          language: repo.language,
          stars: repo.stargazers_count,
          forks: repo.forks_count,
          score: repo.score
        })),
        total_count: response.data.total_count
      };
    } catch (error) {
      logger.error('Error searching repositories:', error);
      throw new Error(`Failed to search repositories: ${error.message}`);
    }
  }

  async getUserInfo(params = {}) {
    try {
      const { username } = params;
      const url = username ? `/users/${username}` : '/user';
      
      const response = await this.client.get(url);
      const user = response.data;

      return {
        id: user.id,
        login: user.login,
        name: user.name,
        email: user.email,
        bio: user.bio,
        company: user.company,
        location: user.location,
        public_repos: user.public_repos,
        public_gists: user.public_gists,
        followers: user.followers,
        following: user.following,
        html_url: user.html_url,
        avatar_url: user.avatar_url,
        created_at: user.created_at,
        updated_at: user.updated_at
      };
    } catch (error) {
      logger.error('Error getting user info:', error);
      throw new Error(`Failed to get user info: ${error.message}`);
    }
  }

  getAvailableOperations() {
    return [
      'list_repositories',
      'get_repository',
      'list_issues',
      'create_issue',
      'get_file_content',
      'list_commits',
      'get_pull_requests',
      'search_repositories',
      'get_user_info'
    ];
  }

  getDescription() {
    return 'GitHub MCP server for repository management, issue tracking, and code operations';
  }

  getStatus() {
    return {
      connected: !!this.client,
      rate_limit_remaining: this.rateLimitRemaining,
      rate_limit_reset: this.rateLimitReset ? new Date(this.rateLimitReset * 1000) : null
    };
  }
}