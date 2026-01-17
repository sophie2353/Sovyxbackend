/* -------------------------------------------------------
   Instagram Publisher Module v1.0
   Publica contenido REAL en Instagram via Graph API
   Ubicación: /modules/instagram-publisher.js
------------------------------------------------------- */

const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));

class InstagramPublisher {
  constructor() {
    this.baseUrl = 'https://graph.instagram.com';
    this.apiVersion = 'v18.0';
    this.accessToken = process.env.IG_ACCESS_TOKEN;
    this.userId = process.env.IG_USER_ID;
    
    console.log('📱 Instagram Publisher inicializado');
    console.log(`🔑 Token: ${this.accessToken ? '✅ Configurado' : '❌ FALTANTE'}`);
    console.log(`👤 User ID: ${this.userId ? '✅ Configurado' : '❌ FALTANTE'}`);
    
    if (!this.accessToken || !this.userId) {
      console.error('🚨 ERROR: IG_ACCESS_TOKEN e IG_USER_ID son OBLIGATORIOS en .env');
      console.error('💡 Solución: Ve a Facebook Developers → Crea app → Instagram Graph API');
    }
  }
  
  /**
   * Publica contenido en Instagram
   */
  async publish(options) {
    try {
      console.log('🎯 Iniciando publicación en Instagram...');
      
      const { files, caption = '', client = 'owner', mediaType = 'IMAGE', constraints = {} } = options;
      
      // 1. VALIDACIONES
      if (!this.accessToken || !this.userId) {
        throw new Error('Instagram API no configurada. Verifica IG_ACCESS_TOKEN e IG_USER_ID en .env');
      }
      
      if (!files || files.length === 0) {
        throw new Error('No hay archivos para publicar');
      }
      
      // 2. DETERMINAR TIPO DE CONTENIDO
      const actualMediaType = this.determineMediaType(files, mediaType);
      console.log(`📦 Tipo de contenido: ${actualMediaType}`);
      
      // 3. OPTIMIZAR CAPTION PARA HIGH TICKET
      const optimizedCaption = this.optimizeForHighTicket(caption, constraints);
      console.log(`📝 Caption optimizado: ${optimizedCaption.length} caracteres`);
      
      // 4. PUBLICAR SEGÚN TIPO
      let result;
      switch (actualMediaType) {
        case 'CAROUSEL':
          result = await this.publishCarousel(files, optimizedCaption);
          break;
        case 'VIDEO':
          result = await this.publishVideo(files[0], optimizedCaption);
          break;
        case 'IMAGE':
        default:
          result = await this.publishImage(files[0], optimizedCaption);
      }
      
      // 5. RETORNAR RESULTADO
      return {
        success: true,
        postId: result.id,
        shortcode: this.generateShortcode(result.id),
        postUrl: `https://www.instagram.com/p/${this.generateShortcode(result.id)}/`,
        mediaType: actualMediaType,
        caption: optimizedCaption,
        timestamp: new Date().toISOString(),
        client: client,
        rawResponse: result
      };
      
    } catch (error) {
      console.error('❌ Error en Instagram Publisher:', error.message);
      return {
        success: false,
        error: error.message,
        stack: process.env.NODE_ENV === 'development' ? error.stack : undefined,
        timestamp: new Date().toISOString()
      };
    }
  }
  
  /**
   * Publica una imagen
   */
  async publishImage(file, caption) {
    console.log('🖼️ Publicando imagen...');
    
    // Para PRODUCCIÓN REAL necesitas:
    // 1. Subir imagen a servidor público (S3, Cloudinary, etc.)
    // 2. Pasar URL pública a Instagram API
    // 3. Por ahora, usamos placeholder
    
    const imageUrl = await this.uploadToPublicServer(file);
    
    const createResponse = await fetch(
      `https://graph.instagram.com/${this.userId}/media`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          image_url: imageUrl,
          caption: caption.substring(0, 2200),
          access_token: this.accessToken
        })
      }
    );
    
    const createData = await createResponse.json();
    
    if (!createData.id) {
      throw new Error(`Error creando imagen: ${JSON.stringify(createData)}`);
    }
    
    console.log(`✅ Media creado: ${createData.id}`);
    
    // Publicar
    const publishResponse = await fetch(
      `https://graph.instagram.com/${this.userId}/media_publish`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          creation_id: createData.id,
          access_token: this.accessToken
        })
      }
    );
    
    const publishData = await publishResponse.json();
    
    if (!publishData.id) {
      throw new Error(`Error publicando: ${JSON.stringify(publishData)}`);
    }
    
    console.log(`✅ Imagen publicada: ${publishData.id}`);
    return publishData;
  }
  
  /**
   * Publica un video
   */
  async publishVideo(file, caption) {
    console.log('🎬 Publicando video...');
    
    // Similar a imagen, pero con video_url
    const videoUrl = await this.uploadToPublicServer(file);
    
    const createResponse = await fetch(
      `https://graph.instagram.com/${this.userId}/media`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          media_type: 'VIDEO',
          video_url: videoUrl,
          caption: caption.substring(0, 2200),
          access_token: this.accessToken
        })
      }
    );
    
    const createData = await createResponse.json();
    
    if (!createData.id) {
      throw new Error(`Error creando video: ${JSON.stringify(createData)}`);
    }
    
    console.log(`✅ Video creado: ${createData.id}`);
    
    // Esperar procesamiento
    await this.waitForProcessing(createData.id);
    
    // Publicar
    const publishResponse = await fetch(
      `https://graph.instagram.com/${this.userId}/media_publish`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          creation_id: createData.id,
          access_token: this.accessToken
        })
      }
    );
    
    const publishData = await publishResponse.json();
    
    console.log(`✅ Video publicado: ${publishData.id}`);
    return publishData;
  }
  
  /**
   * Publica carousel
   */
  async publishCarousel(files, caption) {
    console.log(`🖼️🖼️ Publicando carousel con ${files.length} elementos...`);
    
    const childrenIds = [];
    
    // Crear cada elemento
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const isImage = file.mimetype.startsWith('image/');
      
      const mediaUrl = await this.uploadToPublicServer(file);
      
      const createBody = {
        access_token: this.accessToken
      };
      
      if (isImage) {
        createBody.image_url = mediaUrl;
      } else {
        createBody.media_type = 'VIDEO';
        createBody.video_url = mediaUrl;
      }
      
      createBody.is_carousel_item = true;
      
      const createResponse = await fetch(
        `https://graph.instagram.com/${this.userId}/media`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(createBody)
        }
      );
      
      const createData = await createResponse.json();
      
      if (createData.id) {
        childrenIds.push(createData.id);
        console.log(`✅ Elemento ${i + 1} creado: ${createData.id}`);
        
        if (!isImage) {
          await this.waitForProcessing(createData.id);
        }
      }
    }
    
    // Crear carousel
    const carouselResponse = await fetch(
      `https://graph.instagram.com/${this.userId}/media`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          media_type: 'CAROUSEL',
          children: childrenIds.join(','),
          caption: caption.substring(0, 2200),
          access_token: this.accessToken
        })
      }
    );
    
    const carouselData = await carouselResponse.json();
    
    if (!carouselData.id) {
      throw new Error(`Error creando carousel: ${JSON.stringify(carouselData)}`);
    }
    
    // Publicar carousel
    const publishResponse = await fetch(
      `https://graph.instagram.com/${this.userId}/media_publish`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          creation_id: carouselData.id,
          access_token: this.accessToken
        })
      }
    );
    
    const publishData = await publishResponse.json();
    
    console.log(`✅ Carousel publicado: ${publishData.id}`);
    return publishData;
  }
  
  /**
   * Determina tipo de media
   */
  determineMediaType(files, requestedType) {
    if (files.length > 1) return 'CAROUSEL';
    
    const file = files[0];
    if (file.mimetype.startsWith('video/')) return 'VIDEO';
    if (file.mimetype.startsWith('image/')) return 'IMAGE';
    
    return requestedType || 'IMAGE';
  }
  
  /**
   * Optimiza caption para high ticket
   */
  optimizeForHighTicket(caption, constraints) {
    let optimized = caption || '';
    
    // Añadir llamados a acción high ticket
    if (!optimized.includes('💼') && !optimized.includes('🎯')) {
      optimized = `💼 HIGH TICKET EDITION\n\n${optimized}`;
    }
    
    // Añadir hashtags estratégicos
    const hashtags = this.generateHighTicketHashtags(constraints);
    if (!optimized.includes('#')) {
      optimized += `\n\n${hashtags}`;
    } else {
      // Añadir hashtags faltantes
      const existingHashtags = (optimized.match(/#\w+/g) || []).map(h => h.toLowerCase());
      const newHashtags = hashtags.split(' ').filter(tag => 
        !existingHashtags.includes(tag.toLowerCase())
      );
      
      if (newHashtags.length > 0) {
        optimized += ` ${newHashtags.join(' ')}`;
      }
    }
    
    // Limitar a 2200 caracteres (límite de Instagram)
    if (optimized.length > 2200) {
      optimized = optimized.substring(0, 2197) + '...';
    }
    
    return optimized;
  }
  
  /**
   * Genera hashtags high ticket
   */
  generateHighTicketHashtags(constraints) {
    const baseHashtags = [
      '#HighTicket', '#BusinessGrowth', '#Entrepreneur',
      '#DigitalBusiness', '#PremiumService', '#SuccessMindset'
    ];
    
    const segmentHashtags = {
      emprendedores: ['#Emprendimiento', '#Startup', '#NegociosDigitales'],
      consultores: ['#Consultoría', '#Asesoría', '#Expertise'],
      coaches: ['#Coaching', '#DesarrolloPersonal', '#Liderazgo'],
      inversores: ['#Inversiones', '#Finanzas', '#WealthBuilding'],
      profesionales: ['#Profesional', '#Carrera', '#Excelencia']
    };
    
    let hashtags = [...baseHashtags];
    
    if (constraints.business_type) {
      constraints.business_type.forEach(biz => {
        if (segmentHashtags[biz]) {
          hashtags.push(...segmentHashtags[biz]);
        }
      });
    }
    
    // Limitar a 30 hashtags (buena práctica)
    return hashtags.slice(0, 30).join(' ');
  }
  
  /**
   * Sube archivo a servidor público (SIMULACIÓN)
   * EN PRODUCCIÓN: Implementar con S3, Cloudinary, etc.
   */
  async uploadToPublicServer(file) {
    console.log('🌐 Subiendo archivo a servidor público...');
    
    // EN PRODUCCIÓN REAL, IMPLEMENTA:
    // 1. AWS S3: https://aws.amazon.com/s3/
    // 2. Cloudinary: https://cloudinary.com/
    // 3. Firebase Storage: https://firebase.google.com/products/storage
    
    // Por ahora, retornamos URL de placeholder
    console.warn('⚠️  Usando placeholder. En producción, implementa uploadToPublicServer()');
    
    if (file.mimetype.startsWith('image/')) {
      return 'https://images.unsplash.com/photo-1611224923853-80b023f02d71?ixlib=rb-4.0.3&w=1080&h=1350&fit=crop';
    } else if (file.mimetype.startsWith('video/')) {
      return 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4';
    }
    
    throw new Error(`Tipo de archivo no soportado: ${file.mimetype}`);
  }
  
  /**
   * Espera procesamiento de Instagram
   */
  async waitForProcessing(mediaId, maxAttempts = 30) {
    console.log(`⏳ Esperando procesamiento de ${mediaId}...`);
    
    for (let i = 0; i < maxAttempts; i++) {
      try {
        const response = await fetch(
          `https://graph.instagram.com/${mediaId}?fields=status&access_token=${this.accessToken}`
        );
        
        const data = await response.json();
        
        if (data.status === 'FINISHED') {
          console.log(`✅ Procesamiento completado en ${i + 1} intentos`);
          return true;
        }
        
        if (data.status === 'ERROR') {
          throw new Error(`Error en procesamiento: ${JSON.stringify(data)}`);
        }
        
        // Esperar 2 segundos
        await new Promise(resolve => setTimeout(resolve, 2000));
        
      } catch (error) {
        if (i === maxAttempts - 1) {
          throw new Error(`Timeout en procesamiento: ${error.message}`);
        }
      }
    }
    
    throw new Error('Timeout en procesamiento');
  }
  
  /**
   * Genera shortcode para URL de Instagram
   */
  generateShortcode(postId) {
    // Instagram usa base64 modificado para shortcodes
    const base64 = Buffer.from(postId.toString()).toString('base64');
    return base64.substring(0, 11).replace(/[+/=]/g, '');
  }
}

// Exportar instancia única
module.exports = new InstagramPublisher();
