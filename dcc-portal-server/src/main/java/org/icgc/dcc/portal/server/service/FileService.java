/*
 * Copyright (c) 2015 The Ontario Institute for Cancer Research. All rights reserved.
 *
 * This program and the accompanying materials are made available under the terms of the GNU Public License v3.0.
 * You should have received a copy of the GNU General Public License along with
 * this program. If not, see <http://www.gnu.org/licenses/>.
 *
 * THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND ANY
 * EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED WARRANTIES
 * OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT
 * SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT,
 * INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED
 * TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR PROFITS;
 * OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER
 * IN CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN
 * ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
 */
package org.icgc.dcc.portal.server.service;

import static com.google.common.collect.Iterables.toArray;
import static com.google.common.collect.Iterables.transform;
import static com.google.common.collect.Lists.newArrayList;
import static com.google.common.collect.Sets.intersection;
import static java.util.Collections.emptyList;
import static java.util.stream.Collectors.joining;
import static java.util.stream.Collectors.toMap;
import static org.icgc.dcc.common.core.util.Separators.COMMA;
import static org.icgc.dcc.common.core.util.stream.Collectors.toImmutableMap;
import static org.icgc.dcc.common.core.util.stream.Collectors.toImmutableSet;
import static org.icgc.dcc.portal.server.model.File.parse;
import static org.icgc.dcc.portal.server.model.IndexModel.TEXT_PREFIX;
import static org.icgc.dcc.portal.server.repository.FileRepository.CustomAggregationKeys.REPO_DONOR_COUNT;
import static org.icgc.dcc.portal.server.repository.FileRepository.CustomAggregationKeys.REPO_SIZE;
import static org.icgc.dcc.portal.server.util.Collections.isEmpty;
import static org.icgc.dcc.portal.server.util.ElasticsearchResponseUtils.createResponseMap;
import static org.icgc.dcc.portal.server.util.SearchResponses.hasHits;
import static org.supercsv.prefs.CsvPreference.TAB_PREFERENCE;

import java.io.BufferedWriter;
import java.io.OutputStream;
import java.io.OutputStreamWriter;
import java.nio.charset.StandardCharsets;
import java.util.AbstractMap.SimpleImmutableEntry;
import java.util.Collection;
import java.util.List;
import java.util.Map;
import java.util.Map.Entry;
import java.util.Set;
import java.util.function.Function;
import java.util.stream.Stream;

import org.dcc.portal.pql.meta.FileTypeModel.Fields;
import org.dcc.portal.pql.meta.IndexModel;
import org.elasticsearch.action.search.SearchResponse;
import org.elasticsearch.search.SearchHit;
import org.elasticsearch.search.SearchHits;
import org.elasticsearch.search.aggregations.bucket.filters.Filters.Bucket;
import org.elasticsearch.search.aggregations.bucket.filters.InternalFilters;
import org.elasticsearch.search.aggregations.bucket.nested.InternalNested;
import org.elasticsearch.search.aggregations.bucket.terms.StringTerms;
import org.elasticsearch.search.aggregations.bucket.terms.Terms;
import org.elasticsearch.search.aggregations.metrics.sum.InternalSum;
import org.icgc.dcc.common.core.util.stream.Collectors;
import org.icgc.dcc.portal.server.model.EntityType;
import org.icgc.dcc.portal.server.model.File;
import org.icgc.dcc.portal.server.model.File.Donor;
import org.icgc.dcc.portal.server.model.File.FileCopy;
import org.icgc.dcc.portal.server.model.Files;
import org.icgc.dcc.portal.server.model.Keyword;
import org.icgc.dcc.portal.server.model.Keywords;
import org.icgc.dcc.portal.server.model.Pagination;
import org.icgc.dcc.portal.server.model.Query;
import org.icgc.dcc.portal.server.model.TermFacet;
import org.icgc.dcc.portal.server.model.UniqueSummaryQuery;
import org.icgc.dcc.portal.server.pql.convert.AggregationToFacetConverter;
import org.icgc.dcc.portal.server.repository.FileRepository;
import org.icgc.dcc.portal.server.repository.FileRepository.CustomAggregationKeys;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.supercsv.io.CsvMapWriter;

import com.google.common.collect.ImmutableMap;
import com.google.common.collect.Iterables;

import lombok.Cleanup;
import lombok.NonNull;
import lombok.RequiredArgsConstructor;
import lombok.SneakyThrows;
import lombok.val;
import lombok.extern.slf4j.Slf4j;

@Service
@Slf4j
@RequiredArgsConstructor(onConstructor = @__({ @Autowired }))
public class FileService {

  /**
   * Constants.
   */
  private static final String UTF_8 = StandardCharsets.UTF_8.name();

  private static final Map<String, String> DATA_TABLE_EXPORT_MAP = ImmutableMap.<String, String> builder()
      .put(Fields.ACCESS, "Access")
      .put(Fields.FILE_ID, "File ID")
      .put(Fields.DONOR_ID, "ICGC Donor")
      .put(Fields.REPO_NAME, "Repository")
      .put(Fields.PROJECT_CODE, "Project")
      .put(Fields.STUDY, "Study")
      .put(Fields.DATA_TYPE, "Data Type")
      .put(Fields.EXPERIMENTAL_STRATEGY, "Experimental Strategy")
      .put(Fields.FILE_FORMAT, "Format")
      .put(Fields.FILE_SIZE, "Size (bytes)")
      .build();
  private static final Set<String> DATA_TABLE_EXPORT_MAP_FIELD_KEYS = toRawFieldSet(
      DATA_TABLE_EXPORT_MAP.keySet());
  private static final String[] DATA_TABLE_MAPPING_KEYS = toArray(DATA_TABLE_EXPORT_MAP.keySet(), String.class);
  private static final String[] DATA_TABLE_EXPORT_MAP_FIELD_ARRAY =
      toArray(DATA_TABLE_EXPORT_MAP_FIELD_KEYS, String.class);

  private static final Keywords NO_MATCH_KEYWORD_SEARCH_RESULT = new Keywords(emptyList());
  private static final Map<String, String> KEYWORD_SEARCH_TYPE_ENTRY = ImmutableMap.of(
      "text.type", "donor");
  private static final Map<String, String> FILE_DONOR_INDEX_TYPE_TO_KEYWORD_FIELD_MAPPING =
      ImmutableMap.<String, String> builder()
          .put("text.id", "id")
          .put("text.specimen_id", "specimenIds")
          .put("text.sample_id", "sampleIds")
          .put("text.submitted_donor_id", "submittedId")
          .put("text.submitted_specimen_id", "submittedSpecimenIds")
          .put("text.submitted_sample_id", "submittedSampleIds")
          .put("text.tcga_participant_barcode", "TCGAParticipantBarcode")
          .put("text.tcga_sample_barcode", "TCGASampleBarcode")
          .put("text.tcga_aliquot_barcode", "TCGAAliquotBarcode")
          .build();

  /**
   * Dependencies
   */
  @NonNull
  private final FileRepository fileRepository;

  public Map<String, String> findRepos() {
    return fileRepository.findRepos();
  }

  public Files findAll(@NonNull Query query) {
    val response = fileRepository.findAll(query);
    val hits = response.getHits();
    val files = new Files(convertHitsToRepoFiles(hits, query));

    val termFacets = AggregationToFacetConverter.getInstance().convert(response.getAggregations());
    val donorCount = fileRepository.searchGroupByRepoNameDonorId(termFacets, query);

    val allFacets = ImmutableMap.<String, TermFacet> builder()
        .putAll(termFacets)
        .put(CustomAggregationKeys.REPO_DONOR_COUNT, donorCount)
        .build();

    files.setTermFacets(allFacets);
    files.setPagination(Pagination.of(hits.getHits().length, hits.getTotalHits(), query));
    return files;
  }

  /**
   * Emulating keyword search, but without prefix/ngram analyzers..ie: exact match
   */
  public Keywords findRepoDonor(@NonNull Query query) {
    val response = fileRepository.findRepoDonor(
        FILE_DONOR_INDEX_TYPE_TO_KEYWORD_FIELD_MAPPING.keySet(), query.getQuery());
    val hits = response.getHits();

    if (hits.totalHits() < 1) {
      return NO_MATCH_KEYWORD_SEARCH_RESULT;
    }

    val keywords = transform(hits,
        hit -> new Keyword(toKeywordFieldMap(hit)));

    return new Keywords(newArrayList(keywords));
  }

  public File findOne(@NonNull String fileId) {
    log.info("External repository file id is: '{}'.", fileId);

    val response = fileRepository.findOne(fileId);
    return parse(response.getSourceAsString());
  }

  public long getDonorCount(@NonNull Query query) {
    return fileRepository.getDonorCount(query);
  }

  public Map<String, String> getIndexMetadata() {
    return fileRepository.getIndexMetaData();
  }

  public Map<String, Long> getSummary(@NonNull Query query) {
    return fileRepository.getSummary(query);
  }

  public Map<String, Map<String, Map<String, Object>>> getStudyStats(String study) {
    return fileRepository.getStudyStats(study);
  }

  public Map<String, Map<String, Map<String, Object>>> getRepoStats(String repoName) {
    return fileRepository.getRepoStats(repoName);
  }

  public void exportFiles(OutputStream output, Query query, String type) {
    val prepResponse = fileRepository.findAll(query, DATA_TABLE_EXPORT_MAP_FIELD_ARRAY);
    exportFiles(output, prepResponse, query, DATA_TABLE_MAPPING_KEYS, type);
  }

  public void exportFiles(OutputStream output, String setId, String type) {
    val prepResponse = fileRepository.findAll(setId, DATA_TABLE_EXPORT_MAP_FIELD_ARRAY);
    exportFiles(output, prepResponse, new Query(), DATA_TABLE_MAPPING_KEYS, type);
  }

  public Map<String, Map<String, Long>> getUniqueFileAggregations(UniqueSummaryQuery summary) {
    val response = fileRepository.getManifestSummary(summary);

    val filtersAggs = (InternalFilters) response.getAggregations().asMap().get("summary");
    val repos = summary.getRepoNames();
    val responseMap = repos.stream()
        .map(repo -> {
          // Map each repo to an entry keyed off the repo name with the fileCount, fileSize, and donorCount
          // aggregations in a Map as the value.
          Bucket bucket = filtersAggs.getBucketByKey(repo);
          long count = bucket.getDocCount();
          long size = getRepoSize((InternalNested) bucket.getAggregations().get(REPO_SIZE), repo);
          long donorCount = getDonorCount((InternalNested) bucket.getAggregations().get(REPO_DONOR_COUNT));

          Map<String, Long> map = ImmutableMap.of("fileCount", count, "fileSize", size, "donorCount", donorCount);
          return new SimpleImmutableEntry<String, Map<String, Long>>(repo, map);
        }).collect(toImmutableMap(Entry::getKey, Entry::getValue));

    return responseMap;
  }

  private long getDonorCount(InternalNested aggs) {
    return ((Terms) aggs.getAggregations().get(REPO_DONOR_COUNT)).getBuckets().size();
  }

  private long getRepoSize(InternalNested aggs, String repo) {
    val stringTerms = (StringTerms) aggs.getAggregations().get(REPO_SIZE);
    val repoBucket = stringTerms.getBucketByKey(repo);
    // If there are no matching documents for this repo, the bucket will be empty (null).
    if (repoBucket != null && repoBucket.getAggregations() != null) {
      val internalSum = (InternalSum) stringTerms.getBucketByKey(repo).getAggregations().get("fileSize");
      return (long) internalSum.getValue();
    } else {
      return 0;
    }
  }

  @SneakyThrows
  private void exportFiles(OutputStream output, SearchResponse response, Query query, String[] keys, String type) {
    @Cleanup
    val writer = new CsvMapWriter(new BufferedWriter(new OutputStreamWriter(output, UTF_8)), TAB_PREFERENCE);
    writer.writeHeader(toArray(DATA_TABLE_EXPORT_MAP.values(), String.class));

    String scrollId = response.getScrollId();

    while (true) {
      if (!hasHits(response)) {
        break;
      }

      val files = convertHitsToRepoFiles(response.getHits(), query);
      if("json".equals(type)) {

      } else {
        for (val file : files) {
          writer.write(toRowMap(file), keys);
        }
      }

      scrollId = response.getScrollId();
      response = fileRepository.prepareSearchScroll(scrollId);
    }
  }

  private static Set<String> toRawFieldSet(Collection<String> aliases) {
    return aliases.stream().map(k -> IndexModel.getFileTypeModel().getField(k))
        .collect(toImmutableSet());
  }

  private static String toSummarizedString(Collection<Object> values) {
    if (isEmpty(values)) {
      return "";
    }

    val count = values.size();

    // Get the value if there is only one element; otherwise get the count or empty string if empty.
    return (count > 1) ? String.valueOf(count) : Iterables.get(values, 0).toString();
  }

  private static Map<String, String> toRowMap(File file) {
    val row = ImmutableMap.<String, String> builder();
    val study = file.getStudy();
    val strategy = file.getDataCategorization().getExperimentalStrategy();
    val dataType = file.getDataCategorization().getDataType();

    row.put(Fields.DONOR_ID,
        toSummarizedString(fieldToSet(file.getDonors(), Donor::getDonorId)));
    row.put(Fields.PROJECT_CODE,
        toSummarizedString(fieldToSet(file.getDonors(), Donor::getProjectCode)));
    row.put(Fields.FILE_SIZE,
        String.valueOf(file.getFileCopies().stream().mapToLong(FileCopy::getFileSize).average().orElse(0)));
    row.put(Fields.ACCESS, file.getAccess());
    row.put(Fields.FILE_ID, file.getId());
    row.put(Fields.REPO_NAME, fieldToCSV(file.getFileCopies(), FileCopy::getRepoName));
    row.put(Fields.STUDY, study != null ? study.stream().distinct().collect(joining(COMMA)) : "");
    row.put(Fields.DATA_TYPE, dataType != null? dataType : "");
    row.put(Fields.EXPERIMENTAL_STRATEGY, strategy != null ? strategy : "");
    row.put(Fields.FILE_FORMAT, fieldToCSV(file.getFileCopies(), FileCopy::getFileFormat));

    return row.build();
  }

  private static Collection<Object> fieldToSet(List<Donor> list, Function<Donor, String> mapper) {
    return list.stream().map(mapper).collect(toImmutableSet());
  }

  private static String fieldToCSV(List<FileCopy> list, Function<FileCopy, String> mapper) {
    return list.stream().map(mapper).distinct().collect(joining(COMMA));
  }

  private static Map<String, Object> toKeywordFieldMap(@NonNull SearchHit hit) {
    val source = hit.getSource();
    @SuppressWarnings("unchecked")
    val valueMap = (Map<String, Object>) source.get("text");

    val cleanedFields = FILE_DONOR_INDEX_TYPE_TO_KEYWORD_FIELD_MAPPING.keySet().stream()
        .map(f -> f.split("\\.")[1]) // TODO: do better. Related to broken text search: DCCPRTL-235
        .collect(toImmutableSet());

    val commonKeys = intersection(cleanedFields, valueMap.keySet());

    val result = commonKeys.stream().collect(toMap(
        key -> TEXT_PREFIX + key,
        key -> valueMap.get(key)));
    result.putAll(KEYWORD_SEARCH_TYPE_ENTRY);

    return result;
  }

  private static List<File> convertHitsToRepoFiles(SearchHits hits, Query query) {

    return Stream.of(hits.getHits())
        .map(hit -> createResponseMap(hit, query, EntityType.FILE))
        .map(File::parse)
        .collect(Collectors.toImmutableList());
  }

}
