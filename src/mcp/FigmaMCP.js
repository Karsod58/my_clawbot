import axios from 'axios';
import { logger } from '../utils/logger.js';

export class FigmaMCP {
  constructor() {
    this.token = process.env.FIGMA_TOKEN;
    this.baseURL = 'https://api.figma.com/v1';
    this.client = null;
  }

  async initialize() {
    if (!this.token) {
      throw new Error('FIGMA_TOKEN not provided');
    }

    this.client = axios.create({
      baseURL: this.baseURL,
      headers: {
        'X-Figma-Token': this.token,
        'Content-Type': 'application/json'
      }
    });

    // Test the connection
    try {
      await this.client.get('/me');
      logger.info('Figma MCP initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize Figma MCP:', error);
      throw error;
    }
  }

  async executeOperation(operation, parameters, userId) {
    switch (operation) {
      case 'get_user_info':
        return await this.getUserInfo();
      
      case 'list_team_projects':
        return await this.listTeamProjects(parameters);
      
      case 'get_project_files':
        return await this.getProjectFiles(parameters);
      
      case 'get_file':
        return await this.getFile(parameters);
      
      case 'get_file_nodes':
        return await this.getFileNodes(parameters);
      
      case 'get_images':
        return await this.getImages(parameters);
      
      case 'get_comments':
        return await this.getComments(parameters);
      
      case 'post_comment':
        return await this.postComment(parameters);
      
      case 'get_team_components':
        return await this.getTeamComponents(parameters);
      
      case 'get_component':
        return await this.getComponent(parameters);
      
      case 'get_team_styles':
        return await this.getTeamStyles(parameters);
      
      case 'get_style':
        return await this.getStyle(parameters);
      
      default:
        throw new Error(`Unknown Figma operation: ${operation}`);
    }
  }

  async getUserInfo() {
    try {
      const response = await this.client.get('/me');
      const user = response.data;

      return {
        id: user.id,
        email: user.email,
        handle: user.handle,
        img_url: user.img_url
      };
    } catch (error) {
      logger.error('Error getting user info:', error);
      throw new Error(`Failed to get user info: ${error.message}`);
    }
  }

  async listTeamProjects(params) {
    try {
      const { team_id } = params;
      
      if (!team_id) {
        throw new Error('team_id parameter is required');
      }

      const response = await this.client.get(`/teams/${team_id}/projects`);
      
      return {
        projects: response.data.projects.map(project => ({
          id: project.id,
          name: project.name
        }))
      };
    } catch (error) {
      logger.error('Error listing team projects:', error);
      throw new Error(`Failed to list team projects: ${error.message}`);
    }
  }

  async getProjectFiles(params) {
    try {
      const { project_id } = params;
      
      if (!project_id) {
        throw new Error('project_id parameter is required');
      }

      const response = await this.client.get(`/projects/${project_id}/files`);
      
      return {
        files: response.data.files.map(file => ({
          key: file.key,
          name: file.name,
          thumbnail_url: file.thumbnail_url,
          last_modified: file.last_modified
        }))
      };
    } catch (error) {
      logger.error('Error getting project files:', error);
      throw new Error(`Failed to get project files: ${error.message}`);
    }
  }

  async getFile(params) {
    try {
      const { file_key, version, ids, depth = 1, geometry = 'paths', plugin_data } = params;
      
      if (!file_key) {
        throw new Error('file_key parameter is required');
      }

      const queryParams = { depth, geometry };
      if (version) queryParams.version = version;
      if (ids) queryParams.ids = ids;
      if (plugin_data) queryParams.plugin_data = plugin_data;

      const response = await this.client.get(`/files/${file_key}`, {
        params: queryParams
      });

      const file = response.data;

      return {
        name: file.name,
        role: file.role,
        last_modified: file.lastModified,
        thumbnail_url: file.thumbnailUrl,
        version: file.version,
        document: this.simplifyNode(file.document),
        components: file.components ? Object.keys(file.components).map(key => ({
          key,
          ...file.components[key]
        })) : [],
        styles: file.styles ? Object.keys(file.styles).map(key => ({
          key,
          ...file.styles[key]
        })) : []
      };
    } catch (error) {
      logger.error('Error getting file:', error);
      throw new Error(`Failed to get file: ${error.message}`);
    }
  }

  async getFileNodes(params) {
    try {
      const { file_key, ids, version, depth = 1, geometry = 'paths', plugin_data } = params;
      
      if (!file_key || !ids) {
        throw new Error('file_key and ids parameters are required');
      }

      const queryParams = { ids, depth, geometry };
      if (version) queryParams.version = version;
      if (plugin_data) queryParams.plugin_data = plugin_data;

      const response = await this.client.get(`/files/${file_key}/nodes`, {
        params: queryParams
      });

      const nodes = response.data.nodes;
      
      return {
        nodes: Object.keys(nodes).map(nodeId => ({
          id: nodeId,
          ...this.simplifyNode(nodes[nodeId].document)
        }))
      };
    } catch (error) {
      logger.error('Error getting file nodes:', error);
      throw new Error(`Failed to get file nodes: ${error.message}`);
    }
  }

  async getImages(params) {
    try {
      const { file_key, ids, scale = 1, format = 'png', svg_include_id, svg_simplify_stroke, use_absolute_bounds } = params;
      
      if (!file_key || !ids) {
        throw new Error('file_key and ids parameters are required');
      }

      const queryParams = { ids, scale, format };
      if (svg_include_id) queryParams.svg_include_id = svg_include_id;
      if (svg_simplify_stroke) queryParams.svg_simplify_stroke = svg_simplify_stroke;
      if (use_absolute_bounds) queryParams.use_absolute_bounds = use_absolute_bounds;

      const response = await this.client.get(`/images/${file_key}`, {
        params: queryParams
      });

      return {
        err: response.data.err,
        images: response.data.images,
        status: response.data.status
      };
    } catch (error) {
      logger.error('Error getting images:', error);
      throw new Error(`Failed to get images: ${error.message}`);
    }
  }

  async getComments(params) {
    try {
      const { file_key } = params;
      
      if (!file_key) {
        throw new Error('file_key parameter is required');
      }

      const response = await this.client.get(`/files/${file_key}/comments`);
      
      return {
        comments: response.data.comments.map(comment => ({
          id: comment.id,
          file_key: comment.file_key,
          parent_id: comment.parent_id,
          user: comment.user,
          created_at: comment.created_at,
          resolved_at: comment.resolved_at,
          message: comment.message,
          client_meta: comment.client_meta
        }))
      };
    } catch (error) {
      logger.error('Error getting comments:', error);
      throw new Error(`Failed to get comments: ${error.message}`);
    }
  }

  async postComment(params) {
    try {
      const { file_key, message, client_meta } = params;
      
      if (!file_key || !message) {
        throw new Error('file_key and message parameters are required');
      }

      const commentData = { message };
      if (client_meta) commentData.client_meta = client_meta;

      const response = await this.client.post(`/files/${file_key}/comments`, commentData);
      
      return {
        id: response.data.id,
        file_key: response.data.file_key,
        parent_id: response.data.parent_id,
        user: response.data.user,
        created_at: response.data.created_at,
        message: response.data.message
      };
    } catch (error) {
      logger.error('Error posting comment:', error);
      throw new Error(`Failed to post comment: ${error.message}`);
    }
  }

  async getTeamComponents(params) {
    try {
      const { team_id, page_size = 30, after, before } = params;
      
      if (!team_id) {
        throw new Error('team_id parameter is required');
      }

      const queryParams = { page_size };
      if (after) queryParams.after = after;
      if (before) queryParams.before = before;

      const response = await this.client.get(`/teams/${team_id}/components`, {
        params: queryParams
      });

      return {
        status: response.data.status,
        error: response.data.error,
        meta: response.data.meta,
        components: response.data.meta ? response.data.meta.components.map(component => ({
          key: component.key,
          file_key: component.file_key,
          node_id: component.node_id,
          thumbnail_url: component.thumbnail_url,
          name: component.name,
          description: component.description,
          created_at: component.created_at,
          updated_at: component.updated_at,
          user: component.user
        })) : []
      };
    } catch (error) {
      logger.error('Error getting team components:', error);
      throw new Error(`Failed to get team components: ${error.message}`);
    }
  }

  async getComponent(params) {
    try {
      const { key } = params;
      
      if (!key) {
        throw new Error('key parameter is required');
      }

      const response = await this.client.get(`/components/${key}`);
      const component = response.data.meta;

      return {
        key: component.key,
        file_key: component.file_key,
        node_id: component.node_id,
        thumbnail_url: component.thumbnail_url,
        name: component.name,
        description: component.description,
        created_at: component.created_at,
        updated_at: component.updated_at,
        user: component.user
      };
    } catch (error) {
      logger.error('Error getting component:', error);
      throw new Error(`Failed to get component: ${error.message}`);
    }
  }

  async getTeamStyles(params) {
    try {
      const { team_id, page_size = 30, after, before } = params;
      
      if (!team_id) {
        throw new Error('team_id parameter is required');
      }

      const queryParams = { page_size };
      if (after) queryParams.after = after;
      if (before) queryParams.before = before;

      const response = await this.client.get(`/teams/${team_id}/styles`, {
        params: queryParams
      });

      return {
        status: response.data.status,
        error: response.data.error,
        meta: response.data.meta,
        styles: response.data.meta ? response.data.meta.styles.map(style => ({
          key: style.key,
          file_key: style.file_key,
          node_id: style.node_id,
          style_type: style.style_type,
          thumbnail_url: style.thumbnail_url,
          name: style.name,
          description: style.description,
          created_at: style.created_at,
          updated_at: style.updated_at,
          user: style.user
        })) : []
      };
    } catch (error) {
      logger.error('Error getting team styles:', error);
      throw new Error(`Failed to get team styles: ${error.message}`);
    }
  }

  async getStyle(params) {
    try {
      const { key } = params;
      
      if (!key) {
        throw new Error('key parameter is required');
      }

      const response = await this.client.get(`/styles/${key}`);
      const style = response.data.meta;

      return {
        key: style.key,
        file_key: style.file_key,
        node_id: style.node_id,
        style_type: style.style_type,
        thumbnail_url: style.thumbnail_url,
        name: style.name,
        description: style.description,
        created_at: style.created_at,
        updated_at: style.updated_at,
        user: style.user
      };
    } catch (error) {
      logger.error('Error getting style:', error);
      throw new Error(`Failed to get style: ${error.message}`);
    }
  }

  simplifyNode(node) {
    if (!node) return null;

    const simplified = {
      id: node.id,
      name: node.name,
      type: node.type,
      visible: node.visible
    };

    // Add specific properties based on node type
    if (node.absoluteBoundingBox) {
      simplified.bounds = node.absoluteBoundingBox;
    }

    if (node.fills && node.fills.length > 0) {
      simplified.fills = node.fills;
    }

    if (node.strokes && node.strokes.length > 0) {
      simplified.strokes = node.strokes;
    }

    if (node.children && node.children.length > 0) {
      simplified.children = node.children.map(child => this.simplifyNode(child));
    }

    // Add text-specific properties
    if (node.type === 'TEXT' && node.characters) {
      simplified.text = node.characters;
    }

    return simplified;
  }

  getAvailableOperations() {
    return [
      'get_user_info',
      'list_team_projects',
      'get_project_files',
      'get_file',
      'get_file_nodes',
      'get_images',
      'get_comments',
      'post_comment',
      'get_team_components',
      'get_component',
      'get_team_styles',
      'get_style'
    ];
  }

  getDescription() {
    return 'Figma MCP server for design file management, component access, and collaboration';
  }

  getStatus() {
    return {
      connected: !!this.client,
      base_url: this.baseURL
    };
  }
}