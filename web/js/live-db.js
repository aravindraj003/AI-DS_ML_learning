/* AI&DS-ML LEARNING — live Supabase data layer.
   No course/student/assessment data is stored in browser storage. */

window.LMS = {
  async session() {
    const { data, error } = await window.supabaseClient.auth.getSession();
    if (error) throw error;
    return data?.session || null;
  },

  async profile(userId) {
    const { data, error } = await window.supabaseClient
      .from('profiles')
      .select('id,full_name,email_id,register_id,department,college,role')
      .eq('id', userId)
      .maybeSingle();
    if (error) throw error;
    return data || null;
  },

  async profiles() {
    const { data, error } = await window.supabaseClient
      .from('profiles')
      .select('id,full_name,email_id,register_id,department,college,role')
      .order('full_name');
    if (error) throw error;
    return data || [];
  },

  async units() {
    const { data, error } = await window.supabaseClient
      .from('lms_units')
      .select('id,name,sort_order')
      .order('sort_order')
      .order('name');
    if (error) throw error;
    return data || [];
  },

  async topics() {
    const { data, error } = await window.supabaseClient
      .from('lms_topics')
      .select('id,unit_id,name,link,sort_order')
      .order('sort_order')
      .order('name');
    if (error) throw error;
    return data || [];
  },

  async assessments() {
    const { data, error } = await window.supabaseClient
      .from('lms_assessments')
      .select('id,unit_id,title,description,deadline,duration_minutes,allow_retake,published,created_by,created_at,updated_at')
      .order('created_at');
    if (error) throw error;
    return data || [];
  },

  async adminQuestions() {
    const { data, error } = await window.supabaseClient
      .from('lms_questions')
      .select('id,assessment_id,question_text,options,correct_index,sort_order')
      .order('assessment_id')
      .order('sort_order');
    if (error) throw error;
    return data || [];
  },

  async studentQuestions(assessmentId) {
    const { data, error } = await window.supabaseClient.rpc('get_published_assessment_questions', {
      p_assessment_id: assessmentId
    });
    if (error) {
      console.error('Student assessment question RPC failed:', error);
      throw new Error(error.message || 'Unable to load assessment questions.');
    }
    return data || [];
  },

  async progress() {
    const { data, error } = await window.supabaseClient
      .from('lms_topic_progress')
      .select('id,user_id,topic_id,viewed_at');
    if (error) throw error;
    return data || [];
  },

  async attempts() {
    const { data, error } = await window.supabaseClient
      .from('lms_attempts')
      .select('id,user_id,assessment_id,assessment_session_id,answers,score,correct_count,total_count,status,submitted_at,started_at,time_spent_seconds,submission_reason,reviewed_at,reviewed_by')
      .order('submitted_at', { ascending: false });
    if (error) throw error;
    return data || [];
  },

  async syllabus() {
    const { data, error } = await window.supabaseClient
      .from('lms_syllabus')
      .select('id,title,description,file_name,file_path,mime_type,size_bytes,created_by,created_at')
      .order('created_at', { ascending: false });
    if (error) throw error;
    return data || [];
  },

  async quizzes() {
    const { data, error } = await window.supabaseClient
      .from('lms_quizzes')
      .select('id,title,description,published,created_by,created_at,updated_at')
      .order('created_at', { ascending: false });
    if (error) throw error;
    return data || [];
  },

  async quizQuestions() {
    const { data, error } = await window.supabaseClient
      .from('lms_quiz_questions')
      .select('id,quiz_id,question_text,options,correct_index,sort_order')
      .order('quiz_id')
      .order('sort_order');
    if (error) throw error;
    return data || [];
  },

  async loginEvents() {
    const { data, error } = await window.supabaseClient.from('lms_login_events').select('id,user_id,login_at,last_seen_at,logout_at').order('login_at', { ascending: false });
    if (error) throw error;
    return data || [];
  },

  async recordLogin() { return this.invokeFunction('record-login', {}); },

  async learningSessions() {
    const { data, error } = await window.supabaseClient
      .from('lms_learning_sessions')
      .select('id,user_id,unit_id,topic_id,started_at,last_seen_at,ended_at,duration_seconds')
      .order('started_at', { ascending: false });
    if (error) throw error;
    return data || [];
  },

  async markTopicViewed(userId, topicId) {
    const { error } = await window.supabaseClient
      .from('lms_topic_progress')
      .upsert({ user_id: userId, topic_id: topicId, viewed_at: new Date().toISOString() }, { onConflict: 'user_id,topic_id' });
    if (error) throw error;
  },

  async createUnit(name, sortOrder) {
    const { data, error } = await window.supabaseClient
      .from('lms_units')
      .insert({ name, sort_order: Number(sortOrder) || 0 })
      .select('id,name,sort_order')
      .single();
    if (error) throw error;
    return data;
  },

  async updateUnit(id, name, sortOrder) {
    const { data, error } = await window.supabaseClient
      .from('lms_units')
      .update({ name: String(name || '').trim(), sort_order: Number(sortOrder) || 0 })
      .eq('id', id)
      .select('id,name,sort_order')
      .single();
    if (error) throw error;
    return data;
  },

  async deleteUnit(id) {
    const { error } = await window.supabaseClient.from('lms_units').delete().eq('id', id);
    if (error) throw error;
  },

  async createTopic(unitId, name, link, sortOrder) {
    const { data, error } = await window.supabaseClient
      .from('lms_topics')
      .insert({ unit_id: unitId, name, link, sort_order: sortOrder })
      .select('id,unit_id,name,link,sort_order')
      .single();
    if (error) throw error;
    return data;
  },

  async updateTopic(id, name, link, sortOrder) {
    const { data, error } = await window.supabaseClient
      .from('lms_topics')
      .update({ name: String(name || '').trim(), link: String(link || '').trim(), sort_order: Number(sortOrder) || 0 })
      .eq('id', id)
      .select('id,unit_id,name,link,sort_order')
      .single();
    if (error) throw error;
    return data;
  },

  async deleteTopic(id) {
    const { error } = await window.supabaseClient.from('lms_topics').delete().eq('id', id);
    if (error) throw error;
  },

  async upsertAssessment(payload, questions) {
    const { data, error } = await window.supabaseClient.rpc('admin_save_assessment', {
      p_id: payload.id || null,
      p_unit_id: payload.unit_id || null,
      p_title: payload.title,
      p_description: payload.description || '',
      p_deadline: payload.deadline || null,
      p_duration_minutes: payload.duration_minutes || null,
      p_allow_retake: !!payload.allow_retake,
      p_published: payload.published !== false,
      p_questions: questions || []
    });
    if (error) throw error;
    return { id: data };
  },

  async deleteAssessment(id) {
    const { error } = await window.supabaseClient.from('lms_assessments').delete().eq('id', id);
    if (error) throw error;
  },

  async getUserAttempts(userId) {
    const { data, error } = await window.supabaseClient
      .from('lms_attempts')
      .select('id,user_id,assessment_id,answers,score,correct_count,total_count,status,submitted_at,reviewed_at')
      .eq('user_id', userId)
      .order('submitted_at', { ascending: false });
    if (error) throw error;
    return data || [];
  },

  async updateAttemptStatus(attemptId, status) {
    return this.invokeFunction('admin-review-attempt', { attemptId, status });
  },

  async uploadSyllabus(file, title, description, createdBy) {
    const safeName = file.name.replace(/[^A-Za-z0-9._-]+/g, '_');
    const path = `${createdBy}/${Date.now()}-${safeName}`;
    const { error: uploadError } = await window.supabaseClient.storage
      .from('lms-syllabus')
      .upload(path, file, { cacheControl: '3600', upsert: false, contentType: file.type || undefined });
    if (uploadError) throw uploadError;

    const { data, error: insertError } = await window.supabaseClient
      .from('lms_syllabus')
      .insert({
        title,
        description: description || '',
        file_name: file.name,
        file_path: path,
        mime_type: file.type || 'application/octet-stream',
        size_bytes: file.size,
        created_by: createdBy
      })
      .select('id,title,description,file_name,file_path,mime_type,size_bytes,created_by,created_at')
      .single();
    if (insertError) {
      await window.supabaseClient.storage.from('lms-syllabus').remove([path]);
      throw insertError;
    }
    return data;
  },

  async syllabusUrl(filePath, download = false) {
    const { data, error } = await window.supabaseClient.storage
      .from('lms-syllabus')
      .createSignedUrl(filePath, 3600, download ? { download: true } : undefined);
    if (error) throw error;
    return data?.signedUrl || '';
  },

  async updateSyllabus(id, values) {
    const payload = {};
    for (const key of ['title','description','file_name','file_path','mime_type','size_bytes']) {
      if (values && Object.prototype.hasOwnProperty.call(values, key)) payload[key] = values[key];
    }
    const { data, error } = await window.supabaseClient
      .from('lms_syllabus')
      .update(payload)
      .eq('id', id)
      .select('id,title,description,file_name,file_path,mime_type,size_bytes,created_by,created_at')
      .single();
    if (error) throw error;
    return data;
  },

  async deleteSyllabus(id, path) {
    if (path) {
      const { error: storageError } = await window.supabaseClient.storage.from('lms-syllabus').remove([path]);
      if (storageError) throw storageError;
    }
    const { error } = await window.supabaseClient.from('lms_syllabus').delete().eq('id', id);
    if (error) throw error;
  },

  async upsertQuiz(payload, questions) {
    const { data, error } = await window.supabaseClient.rpc('admin_save_quiz', {
      p_id: payload.id || null,
      p_title: payload.title,
      p_description: payload.description || '',
      p_published: payload.published !== false,
      p_questions: questions || []
    });
    if (error) throw error;
    return { id: data };
  },

  async deleteQuiz(id) {
    const { error } = await window.supabaseClient.from('lms_quizzes').delete().eq('id', id);
    if (error) throw error;
  },

  async invokeFunction(name, payload) {
    const { data, error } = await window.supabaseClient.functions.invoke(name, { body: payload });
    if (error) {
      let message = error.message || `Supabase function ${name} failed.`;
      try {
        const response = error.context;
        if (response && typeof response.json === 'function') {
          const body = await response.json();
          message = body?.error || body?.message || message;
        }
      } catch (_) {
        // Keep the SDK error when the function response is not JSON.
      }
      throw new Error(message);
    }
    return data;
  },

  async adminCreateUser(payload) {
    return this.invokeFunction('admin-create-user', payload);
  },

  async adminUpdateUser(payload) {
    return this.invokeFunction('admin-update-user', payload);
  },

  async adminDeleteUser(payload) {
    return this.invokeFunction('admin-delete-user', payload);
  },

  async startAssessment(assessmentId) {
    return this.invokeFunction('start-assessment', { assessmentId });
  },

  async submitAssessment(assessmentId, answers, sessionId = null, autoTimeout = false) {
    return this.invokeFunction('submit-assessment', { assessmentId, answers, sessionId, autoTimeout });
  },

  async startLearningSession(userId, unitId = null, topicId = null) {
    return this.invokeFunction('start-learning-session', { userId, unitId, topicId });
  },

  async heartbeatLearningSession(id, ended = false) {
    return this.invokeFunction('heartbeat-learning-session', { id, ended });
  },

  async saveAssessmentAnswers(sessionId, answers) {
    return this.invokeFunction('save-assessment-answers', { sessionId, answers });
  },

  async reviewAssessment(attemptId) {
    return this.invokeFunction('review-assessment', { attemptId });
  }
};
